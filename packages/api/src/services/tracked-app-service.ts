import {
  addKeywordForTrackedApp,
  deleteKeywordForTrackedApp,
  filterGeneratedKeywordsForCountry,
  getAppRowById,
  getGeneratedKeywordInputHash,
  getTrackedApp,
  getTrackedAppById,
  insertKeywordRanking,
  listGeneratedKeywordsForTrackedApp,
  listTrackedAppPositionHistory,
  listTrackedAppKeywordRankings,
  listTrackedApps,
  markTrackedAppAnalyzed,
  replaceGeneratedKeywordsForTrackedApp,
  trackApp as dbTrackApp,
  untrackApp as dbUntrackApp,
  makeKeywordLookupId,
  type TrackedAppKeywordRankingEntry,
  type TrackedAppPositionSeries,
  type TrackedAppEntry,
} from "@kittie/db";
import { syncKeywordWithRankings } from "@kittie/ingest";
import { resolveKeywordPosition } from "@kittie/intelligence";
import type { Store } from "@kittie/types";

import { getDb } from "../lib/db.js";
import { cachedGenerate, generate, hashInput, isGeminiConfigured } from "../lib/gemini.js";
import { getKeywordDifficulty, getRelatedKeywords, SUPPORTED_MARKETS } from "./keyword-service.js";

const GENERATED_KEYWORD_KIND = "tracked_app_keywords";
const GENERATED_KEYWORD_LIMIT = 250;
const RANK_SYNC_TTL_MS = 24 * 60 * 60 * 1000;
const TRACKED_APP_RANK_MARKETS = [...SUPPORTED_MARKETS];

interface AppKeywordMetadata {
  title: string;
  developer: string;
  category: string | null;
  description: string | null;
}

interface GeneratedKeywordPayload {
  keywords?: unknown;
}

export type TrackedAppSyncStage =
  | "validate_url"
  | "fetch_app"
  | "generate_keywords"
  | "analyze_markets"
  | "save"
  | "done";

export interface TrackedAppSyncProgress {
  stage?: TrackedAppSyncStage;
  country?: string;
  doneMarkets?: number;
  totalMarkets?: number;
  synced?: number;
  failed?: number;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "app", "apps", "free", "pro", "plus", "lite",
  "ios", "android", "iphone", "ipad", "mobile",
]);

export function buildKeywordGenerationInput(app: AppKeywordMetadata): string {
  return JSON.stringify({
    title: app.title,
    developer: app.developer,
    category: app.category ?? "",
    description: app.description?.slice(0, 2_500) ?? "",
  });
}

export class InvalidKeywordError extends Error {
  constructor(message = "keyword is invalid") {
    super(message);
    this.name = "InvalidKeywordError";
  }
}

function normalizeKeyword(raw: string): string | null {
  const keyword = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!keyword) return null;
  const words = keyword.split(" ").filter((w) => w && !STOPWORDS.has(w));
  if (words.length === 0 || words.length > 5) return null;
  const normalized = words.join(" ");
  return normalized.length >= 3 ? normalized : null;
}

export function normalizeGeneratedKeywords(raw: unknown, limit = GENERATED_KEYWORD_LIMIT): string[] {
  const values = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of values) {
    if (typeof item !== "string") continue;
    const keyword = normalizeKeyword(item);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push(keyword);
    if (out.length >= limit) break;
  }

  return out;
}

function parseGeneratedKeywords(output: string): string[] {
  const parsed = JSON.parse(output) as GeneratedKeywordPayload;
  return normalizeGeneratedKeywords(parsed.keywords);
}

function keywordPrompt(app: AppKeywordMetadata): string {
  return [
    "Generate ASO seed keywords for this mobile app.",
    "Return JSON only: {\"keywords\": string[]}.",
    "Keywords should be user search phrases, 1-5 words each.",
    "Include broad category terms, title-derived phrases, feature terms, and likely competitor-search alternatives.",
    "Do not include brand names unless they are generic words.",
    "Return up to 250 unique keywords.",
    "",
    `Title: ${app.title}`,
    `Developer: ${app.developer}`,
    `Category: ${app.category ?? "Unknown"}`,
    app.description ? `Description: ${app.description.slice(0, 2_500)}` : "Description: Unknown",
  ].join("\n");
}

async function ensureGeneratedKeywords(
  db: ReturnType<typeof getDb>,
  tracked: { id: string; generatedKeywordCount: number },
  app: AppKeywordMetadata & { id: string; store: Store },
  country: string,
): Promise<void> {
  const input = buildKeywordGenerationInput(app);
  const inputHash = hashInput(input);
  const currentHash = await getGeneratedKeywordInputHash(db, tracked.id);

  if (!isGeminiConfigured() || (tracked.generatedKeywordCount > 0 && currentHash === inputHash)) {
    return;
  }

  const { output } = await cachedGenerate(
    GENERATED_KEYWORD_KIND,
    app.id,
    input,
    async () => {
      const raw = await generate(keywordPrompt(app), {
        json: true,
        responseSchema: {
          type: "object",
          properties: {
            keywords: { type: "array", items: { type: "string" } },
          },
          required: ["keywords"],
        },
      });
      return JSON.stringify({ keywords: parseGeneratedKeywords(raw) });
    },
  );
  const keywords = parseGeneratedKeywords(output);
  await replaceGeneratedKeywordsForTrackedApp(db, {
    trackedAppId: tracked.id,
    appId: app.id,
    store: app.store,
    country,
    inputHash,
    keywords,
  });
}

/** The durable tracked-apps list (survives reload). PRD #20 / slice #22. */
export async function listTracked(): Promise<TrackedAppEntry[]> {
  return listTrackedApps(getDb());
}

function isRankSyncStale(lastAnalyzedAt: Date | null): boolean {
  return !lastAnalyzedAt || Date.now() - lastAnalyzedAt.getTime() > RANK_SYNC_TTL_MS;
}

/**
 * Add an app to the tracked list. Idempotent on (appId, store, country), then
 * cache-generates ASO seed keywords from listing metadata when needed.
 * Returns the entry, or null if the app id is unknown.
 */
export async function addTrackedApp(
  appId: string,
  country: string,
): Promise<TrackedAppEntry | null> {
  const db = getDb();
  const app = await getAppRowById(db, appId);
  if (!app) return null;
  await dbTrackApp(db, appId, app.store as Store, country);
  const tracked = await getTrackedApp(db, appId, app.store as Store, country);

  if (tracked) {
    try {
      await ensureGeneratedKeywords(db, tracked, { ...app, store: app.store as Store }, country);
    } catch {
      // Graceful degradation: app remains tracked with count 0. Re-adding or
      // a future retry can run generation again because no keyword rows exist.
    }
  }

  const all = await listTrackedApps(db);
  return all.find((e) => e.appId === appId && e.country === country) ?? null;
}

export async function removeTrackedApp(
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
  await dbUntrackApp(getDb(), appId, store, country);
}

function requireNormalizedKeyword(raw: string): string {
  const normalized = normalizeKeyword(raw);
  if (!normalized) throw new InvalidKeywordError();
  return normalized;
}

export async function addCustomKeywordToTrackedApp(
  trackedAppId: string,
  keyword: string,
  country: string,
): Promise<TrackedAppRankingsResult | null> {
  const normalized = requireNormalizedKeyword(keyword);

  const db = getDb();
  const tracked = await getTrackedAppById(db, trackedAppId);
  if (!tracked) return null;

  const market = country.toUpperCase();
  const generated = await listGeneratedKeywordsForTrackedApp(db, trackedAppId);
  if (generated.some((row) => row.keyword === normalized && (row.source === "ai" || row.country === market))) {
    return listRankingsForTrackedApp(trackedAppId, { country: market });
  }

  await getKeywordDifficulty(normalized, market, tracked.store, { forceRefresh: true });
  await addKeywordForTrackedApp(db, {
    trackedAppId,
    appId: tracked.appId,
    store: tracked.store,
    country: market,
    keyword: normalized,
    inputHash: `custom:${market}`,
    source: "custom",
  });

  return listRankingsForTrackedApp(trackedAppId, { country: market, forceRefresh: true });
}

export async function removeKeywordFromTrackedApp(
  trackedAppId: string,
  keyword: string,
  country: string,
): Promise<TrackedAppRankingsResult | null> {
  const normalized = requireNormalizedKeyword(keyword);

  const db = getDb();
  const tracked = await getTrackedAppById(db, trackedAppId);
  if (!tracked) return null;

  const market = country.toUpperCase();
  const generated = await listGeneratedKeywordsForTrackedApp(db, trackedAppId);
  const row = generated.find((entry) => entry.keyword === normalized);
  if (row) {
    await deleteKeywordForTrackedApp(db, trackedAppId, row.country, normalized);
  }
  return listRankingsForTrackedApp(trackedAppId, { country: market });
}

export async function findSimilarTrackedAppKeywords(
  trackedAppId: string,
  keyword: string,
  country: string,
  limit = 8,
): Promise<string[] | null> {
  const normalized = requireNormalizedKeyword(keyword);

  const tracked = await getTrackedAppById(getDb(), trackedAppId);
  if (!tracked) return null;

  const ideas = await getRelatedKeywords(normalized, country.toUpperCase(), tracked.store, limit);
  return normalizeGeneratedKeywords(ideas, limit).filter((idea) => idea !== normalized);
}

export interface TrackedAppRankingsResult {
  rows: TrackedAppKeywordRankingEntry[];
  history: TrackedAppPositionSeries[];
  synced: number;
  failed: number;
  analyzedAt: Date | null;
}

async function syncRankingsForMarket(
  db: ReturnType<typeof getDb>,
  tracked: TrackedAppEntry,
  generated: Awaited<ReturnType<typeof listGeneratedKeywordsForTrackedApp>>,
  country: string,
  observedAt: Date,
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const market = country.toUpperCase();

  for (const item of generated) {
    try {
      const { results } = await syncKeywordWithRankings(db, item.keyword, market, item.store);
      const position = resolveKeywordPosition(results, tracked.storeAppId);
      await insertKeywordRanking(db, {
        keywordId: makeKeywordLookupId(item.store, market, item.keyword),
        appId: tracked.appId,
        rank: position,
        observedAt,
      });
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

/** Live-sync keyword positions for one tracked app in one selected market. */
export async function listRankingsForTrackedApp(
  trackedAppId: string,
  options: { country?: string; forceRefresh?: boolean } = {},
): Promise<TrackedAppRankingsResult | null> {
  const db = getDb();
  const tracked = await getTrackedAppById(db, trackedAppId);
  if (!tracked) return null;

  const country = (options.country ?? tracked.country).toUpperCase();
  const generated = filterGeneratedKeywordsForCountry(
    await listGeneratedKeywordsForTrackedApp(db, trackedAppId),
    country,
  );
  let synced = 0;
  let failed = 0;
  let analyzedAt = tracked.lastAnalyzedAt;

  if (
    generated.length > 0 &&
    (options.forceRefresh || isRankSyncStale(tracked.lastAnalyzedAt))
  ) {
    const observedAt = new Date();
    const result = await syncRankingsForMarket(db, tracked, generated, country, observedAt);
    synced = result.synced;
    failed = result.failed;
    if (country === tracked.country && failed === 0 && synced === generated.length) {
      await markTrackedAppAnalyzed(db, trackedAppId, observedAt);
      analyzedAt = observedAt;
    }
  }

  return {
    rows: await listTrackedAppKeywordRankings(db, trackedAppId, country),
    history: await listTrackedAppPositionHistory(db, trackedAppId, country),
    synced,
    failed,
    analyzedAt,
  };
}

export interface TrackedAppMarketSyncResult extends TrackedAppRankingsResult {
  tracked: TrackedAppEntry;
  totalMarkets: number;
}

export async function syncRankingsForTrackedAppMarkets(
  trackedAppId: string,
  options: {
    countries?: readonly string[];
    progress?: (event: TrackedAppSyncProgress) => Promise<void> | void;
  } = {},
): Promise<TrackedAppMarketSyncResult | null> {
  const db = getDb();
  const tracked = await getTrackedAppById(db, trackedAppId);
  if (!tracked) return null;

  const valid = new Set<string>(TRACKED_APP_RANK_MARKETS);
  const countries = (options.countries ?? TRACKED_APP_RANK_MARKETS)
    .map((c) => c.toUpperCase())
    .filter((c) => valid.has(c))
    .slice(0, TRACKED_APP_RANK_MARKETS.length);
  const observedAt = new Date();
  let synced = 0;
  let failed = 0;
  let doneMarkets = 0;

  await options.progress?.({
    stage: "analyze_markets",
    doneMarkets,
    totalMarkets: countries.length,
    synced,
    failed,
  });

  for (const country of countries) {
    const generated = filterGeneratedKeywordsForCountry(
      await listGeneratedKeywordsForTrackedApp(db, trackedAppId),
      country,
    );
    const result = await syncRankingsForMarket(db, tracked, generated, country, observedAt);
    synced += result.synced;
    failed += result.failed;
    doneMarkets++;
    await options.progress?.({
      stage: "analyze_markets",
      country,
      doneMarkets,
      totalMarkets: countries.length,
      synced,
      failed,
    });
  }

  if (failed === 0) {
    await markTrackedAppAnalyzed(db, trackedAppId, observedAt);
  }

  return {
    tracked,
    rows: await listTrackedAppKeywordRankings(db, trackedAppId, tracked.country),
    history: await listTrackedAppPositionHistory(db, trackedAppId, tracked.country),
    synced,
    failed,
    analyzedAt: failed === 0 ? observedAt : tracked.lastAnalyzedAt,
    totalMarkets: countries.length,
  };
}

export async function addTrackedAppWithProgress(
  appId: string,
  country: string,
  progress?: (event: TrackedAppSyncProgress) => Promise<void> | void,
): Promise<TrackedAppMarketSyncResult | null> {
  const db = getDb();
  const market = country.toUpperCase();

  await progress?.({ stage: "validate_url" });
  if (!appId.trim()) return null;

  await progress?.({ stage: "fetch_app" });
  const app = await getAppRowById(db, appId);
  if (!app) return null;

  await dbTrackApp(db, appId, app.store as Store, market);
  let tracked = await getTrackedApp(db, appId, app.store as Store, market);
  if (!tracked) return null;

  await progress?.({ stage: "generate_keywords" });
  try {
    await ensureGeneratedKeywords(db, tracked, { ...app, store: app.store as Store }, market);
  } catch {
    // Keep the tracked app and continue. Existing/generated rows, if any, can
    // still be analyzed; a later add retries generation.
  }

  tracked = await getTrackedApp(db, appId, app.store as Store, market);
  if (!tracked) return null;

  const synced = await syncRankingsForTrackedAppMarkets(tracked.id, {
    progress,
  });
  if (!synced) return null;

  await progress?.({ stage: "save", synced: synced.synced, failed: synced.failed });
  const all = await listTrackedApps(db);
  const refreshed = all.find((e) => e.id === tracked.id) ?? synced.tracked;

  return {
    ...synced,
    tracked: refreshed,
    rows: await listTrackedAppKeywordRankings(db, tracked.id, market),
    history: await listTrackedAppPositionHistory(db, tracked.id, market),
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sweepTrackedAppRankHistory(): Promise<{ tracked: number; synced: number; failed: number }> {
  const apps = await listTrackedApps(getDb());
  let synced = 0;
  let failed = 0;

  for (const app of apps) {
    try {
      const result = await syncRankingsForTrackedAppMarkets(app.id);
      synced += result?.synced ?? 0;
      failed += result?.failed ?? 1;
    } catch {
      failed++;
    }
    await sleep(400);
  }

  return { tracked: apps.length, synced, failed };
}

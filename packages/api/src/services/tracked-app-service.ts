import {
  getAppRowById,
  getGeneratedKeywordInputHash,
  getTrackedApp,
  getTrackedAppById,
  insertKeywordRanking,
  listGeneratedKeywordsForTrackedApp,
  listTrackedAppKeywordRankings,
  listTrackedApps,
  markTrackedAppAnalyzed,
  replaceGeneratedKeywordsForTrackedApp,
  trackApp as dbTrackApp,
  untrackApp as dbUntrackApp,
  makeKeywordLookupId,
  type TrackedAppKeywordRankingEntry,
  type TrackedAppEntry,
} from "@kittie/db";
import { syncKeywordWithRankings } from "@kittie/ingest";
import { resolveKeywordPosition } from "@kittie/intelligence";
import type { Store } from "@kittie/types";

import { getDb } from "../lib/db.js";
import { cachedGenerate, generate, hashInput, isGeminiConfigured } from "../lib/gemini.js";

const GENERATED_KEYWORD_KIND = "tracked_app_keywords";
const GENERATED_KEYWORD_LIMIT = 250;
const RANK_SYNC_TTL_MS = 24 * 60 * 60 * 1000;

interface AppKeywordMetadata {
  title: string;
  developer: string;
  category: string | null;
  description: string | null;
}

interface GeneratedKeywordPayload {
  keywords?: unknown;
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
    const input = buildKeywordGenerationInput(app);
    const inputHash = hashInput(input);
    const currentHash = await getGeneratedKeywordInputHash(db, tracked.id);
    try {
      if (isGeminiConfigured() && (tracked.generatedKeywordCount === 0 || currentHash !== inputHash)) {
        const { output } = await cachedGenerate(
          GENERATED_KEYWORD_KIND,
          appId,
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
          appId,
          store: app.store as Store,
          country,
          inputHash,
          keywords,
        });
      }
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

export interface TrackedAppRankingsResult {
  rows: TrackedAppKeywordRankingEntry[];
  synced: number;
  failed: number;
  analyzedAt: Date | null;
}

/** Live-sync US keyword positions for one tracked app's generated keywords. */
export async function listRankingsForTrackedApp(
  trackedAppId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<TrackedAppRankingsResult | null> {
  const db = getDb();
  const tracked = await getTrackedAppById(db, trackedAppId);
  if (!tracked) return null;

  const generated = await listGeneratedKeywordsForTrackedApp(db, trackedAppId);
  let synced = 0;
  let failed = 0;
  let analyzedAt = tracked.lastAnalyzedAt;

  if (
    generated.length > 0 &&
    (options.forceRefresh || isRankSyncStale(tracked.lastAnalyzedAt))
  ) {
    const observedAt = new Date();
    for (const item of generated) {
      try {
        const { results } = await syncKeywordWithRankings(db, item.keyword, item.country, item.store);
        const position = resolveKeywordPosition(results, tracked.storeAppId);
        await insertKeywordRanking(db, {
          keywordId: makeKeywordLookupId(item.store, item.country, item.keyword),
          appId: tracked.appId,
          rank: position,
          observedAt,
        });
        synced++;
      } catch {
        failed++;
      }
    }
    if (failed === 0 && synced === generated.length) {
      await markTrackedAppAnalyzed(db, trackedAppId, observedAt);
      analyzedAt = observedAt;
    }
  }

  return {
    rows: await listTrackedAppKeywordRankings(db, trackedAppId),
    synced,
    failed,
    analyzedAt,
  };
}

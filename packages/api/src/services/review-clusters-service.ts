/**
 * cluster_reviews intelligence (#259) — orchestration. Resolves a competitor set
 * (explicit `appIds` or `find_similar_apps` discovery), fetches their persisted
 * reviews, builds the DETERMINISTIC theme base with `@kittie/intelligence`, then
 * OPTIONALLY relabels theme names/types through the cached Gemini seam. The model
 * only renames + retypes clusters — never the deterministic counts — and any
 * failure (no key, quota, bad JSON) degrades honestly to the taxonomy base.
 */
import type {
  ClusterReviewsRequest,
  FindSimilarAppsInput,
  FindSimilarAppsResult,
  ReviewClustersIntelligenceResponse,
  ReviewTheme,
  ReviewThemeType,
  Store,
} from "@kittie/types";
import { REVIEW_THEME_TYPES } from "@kittie/types";
import {
  buildReviewClustersResponse,
  clusterReviewsDeterministic,
  CLUSTER_DEFAULTS,
  type ClusterInputApp,
  type ClusterInputReview,
} from "@kittie/intelligence";
import { getRecentReviewsForApps, listAppsByIds, reviewCountsByApp, type ClusterReviewRow } from "@kittie/db";
import { getDb } from "../lib/db.js";
import { cachedJson, generate, hashInput, isGeminiConfigured, GEMINI_MODEL } from "../lib/gemini.js";
import { findSimilarApps, SimilarAppsError } from "./similar-apps-service.js";
import { recallReviewedApps, RECALL_SHARE, type RecalledApp } from "./evidence-recall.js";

export class ReviewClustersError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "ReviewClustersError";
  }
}

/** Relabel result for one deterministic theme, keyed by its index. */
export interface ThemeEnrichment {
  name: string;
  type: ReviewThemeType;
}

export interface ReviewClustersEnrichment {
  map: Map<number, ThemeEnrichment>;
  modelVersion: string;
}

export interface ReviewClustersDeps {
  findSimilarApps(input: FindSimilarAppsInput): Promise<FindSimilarAppsResult>;
  /** Which of these apps hold >=1 stored review (query-mode preference, #268). */
  reviewCounts(ids: string[]): Promise<Record<string, number>>;
  /** Recall pass over the review-bearing set (#268) — merged ahead of the pool. */
  recallReviewed(query: string, limit: number): Promise<RecalledApp[]>;
  /** Resolve display names for an explicit `appIds` set (unknown ids drop out). */
  resolveApps(ids: string[]): Promise<ClusterInputApp[]>;
  fetchReviews(ids: string[], perApp: number): Promise<ClusterReviewRow[]>;
  /** LLM relabel of the top themes; `null` when the model is unavailable. */
  enrich(apps: ClusterInputApp[], themes: ReviewTheme[]): Promise<ReviewClustersEnrichment | null>;
  now(): Date;
}

const defaultDeps: ReviewClustersDeps = {
  findSimilarApps,
  reviewCounts: (ids) => reviewCountsByApp(getDb(), ids),
  recallReviewed: recallReviewedApps,
  resolveApps: async (ids) => {
    const rows = await listAppsByIds(getDb(), ids);
    const byId = new Map(rows.map((r) => [r.id, r.title]));
    // Preserve caller order; keep ids we can name (unknown ids are dropped honestly).
    return ids.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id) ?? id }));
  },
  fetchReviews: (ids, perApp) => getRecentReviewsForApps(getDb(), ids, perApp),
  enrich: geminiEnrichThemes,
  now: () => new Date(),
};

function clampInt(value: number | undefined, def: number, min: number, max: number): number {
  if (value === undefined || Number.isNaN(value)) return def;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normaliseStore(store: unknown): Store | undefined {
  return store === "apple" || store === "google" ? store : undefined;
}

export async function getReviewClusters(
  input: ClusterReviewsRequest,
  deps: ReviewClustersDeps = defaultDeps,
): Promise<ReviewClustersIntelligenceResponse> {
  const explicitIds = Array.isArray(input.appIds)
    ? input.appIds.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0)
    : [];
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (explicitIds.length === 0 && query.length === 0) {
    throw new ReviewClustersError("provide a `query` (niche description) or an `appIds` array");
  }
  if (input.store !== undefined && normaliseStore(input.store) === undefined) {
    throw new ReviewClustersError('`store` must be "apple" or "google"');
  }

  const limitApps = clampInt(input.limitApps, CLUSTER_DEFAULTS.limitApps, 1, CLUSTER_DEFAULTS.maxLimitApps);
  const maxReviewsPerApp = clampInt(
    input.maxReviewsPerApp,
    CLUSTER_DEFAULTS.maxReviewsPerApp,
    1,
    CLUSTER_DEFAULTS.hardMaxReviewsPerApp,
  );
  const country = input.country?.trim() || "US";

  // ── resolve the competitor set ──────────────────────────────────────────
  // An explicit `appIds` set always wins over discovery — never overridden.
  let apps: ClusterInputApp[];
  if (explicitIds.length > 0) {
    apps = await deps.resolveApps(explicitIds.slice(0, CLUSTER_DEFAULTS.maxLimitApps));
    if (apps.length === 0) {
      throw new ReviewClustersError("none of the provided appIds resolved to a known app", 404);
    }
  } else {
    let similar: FindSimilarAppsResult;
    try {
      // Over-fetch, then PREFER review-bearing competitors (#268): this is an
      // evidence-seeking primitive — an agent asking "what do users complain
      // about" wants apps that HAVE user evidence. Preference, not filter:
      // relevance order is kept within each group, review-less apps still fill
      // remaining slots, and sourceCoverage reports the truth either way.
      similar = await deps.findSimilarApps({
        query,
        store: normaliseStore(input.store),
        limit: Math.min(limitApps * 4, 50),
      });
    } catch (err) {
      if (err instanceof SimilarAppsError) throw new ReviewClustersError(err.message, err.status);
      throw err;
    }
    const ranked = similar.similar.map((s) => ({ id: s.app.id, name: s.app.title }));
    // Recall pass (#268): catalog FTS misses review-rich incumbents whose titles
    // lack the query token; search the review-bearing set directly and merge its
    // hits FIRST (relevance-guarded — >=1 real token match each).
    const recalled = (await deps.recallReviewed(query, limitApps)).slice(0, Math.max(1, Math.ceil(limitApps * RECALL_SHARE)));
    const counts = ranked.length > 0 ? await deps.reviewCounts(ranked.map((a) => a.id)) : {};
    const withReviews = ranked.filter((a) => (counts[a.id] ?? 0) > 0);
    const without = ranked.filter((a) => (counts[a.id] ?? 0) === 0);
    const merged: ClusterInputApp[] = [];
    const seenIds = new Set<string>();
    for (const a of [...recalled.map((r) => ({ id: r.id, name: r.name })), ...withReviews, ...without]) {
      if (seenIds.has(a.id)) continue;
      seenIds.add(a.id);
      merged.push(a);
    }
    apps = merged.slice(0, limitApps);
    if (apps.length === 0) {
      throw new ReviewClustersError("no competitors matched that query — refine it or pass explicit appIds", 404);
    }
  }

  // ── fetch reviews + build the deterministic base ────────────────────────
  const rows = await deps.fetchReviews(apps.map((a) => a.id), maxReviewsPerApp);
  const reviews: ClusterInputReview[] = rows.map((r) => ({
    appId: r.appId,
    country: r.country,
    rating: r.rating,
    title: r.title,
    body: r.body,
    sentiment: r.sentiment,
    topics: r.topics,
    improvementAreas: r.improvementAreas,
    reviewedAt: r.reviewedAt,
  }));

  const params: ClusterReviewsRequest = {
    query: query || undefined,
    country,
    limitApps,
    maxReviewsPerApp,
    since: input.since,
    themeTypes: input.themeTypes,
    minThemeFrequency: input.minThemeFrequency,
  };
  const now = deps.now();
  const base = clusterReviewsDeterministic({ apps, reviews, params, nowMs: now.getTime() });

  // ── optional LLM relabel (counts stay deterministic) ────────────────────
  let themes = base.themes;
  let enrichment: "llm" | "deterministic" = "deterministic";
  let modelVersion: string | null = null;
  if (base.themes.length > 0) {
    const enriched = await deps.enrich(apps, base.themes);
    if (enriched && enriched.map.size > 0) {
      themes = base.themes.map((t, i) => {
        const e = enriched.map.get(i);
        return e ? { ...t, theme: e.name, type: e.type } : t;
      });
      enrichment = "llm";
      modelVersion = enriched.modelVersion;
    }
  }

  return buildReviewClustersResponse({
    themes,
    coverage: base.coverage,
    totalReviewsAnalyzed: base.totalReviewsAnalyzed,
    reviewDateRange: base.reviewDateRange,
    recentFraction: base.recentFraction,
    localesSeen: base.localesSeen,
    apps,
    params,
    enrichment,
    generatedAt: now.toISOString(),
    modelVersion,
  });
}

/* ---- Gemini relabel seam ------------------------------------------------- */

const MAX_ENRICH_THEMES = CLUSTER_DEFAULTS.maxEvidenceThemes;

/**
 * Ask Gemini to name the specific complaint/praise inside each coarse taxonomy
 * bucket and confirm its type. Cached on the FACTS fed (app set + theme labels +
 * counts), so a repeat call is free. Returns `null` — degrading to the
 * deterministic base — when the model is unconfigured or the call/parse fails.
 */
async function geminiEnrichThemes(
  apps: ClusterInputApp[],
  themes: ReviewTheme[],
): Promise<ReviewClustersEnrichment | null> {
  if (!isGeminiConfigured()) return null;
  const top = themes.slice(0, MAX_ENRICH_THEMES);
  if (top.length === 0) return null;

  const themeFacts = top.map((t, id) => ({
    id,
    label: t.theme,
    type: t.type,
    sentiment: t.sentiment,
    mentions: t.mentionCount,
    quotes: t.quotes.slice(0, 2).map((q) => q.text),
  }));
  const sortedIds = apps.map((a) => a.id).sort();
  const subjectId = `clusters:${hashInput(sortedIds.join(","))}`;
  const input = JSON.stringify({ v: 1, apps: sortedIds, themes: themeFacts });

  const prompt =
    "You are labelling clusters of mobile-app reviews for a market-intelligence API.\n" +
    "For each theme below, write a SPECIFIC plain-language name (≤6 words) for the exact " +
    "complaint, praise or request the quotes describe — not the generic bucket label — and " +
    'confirm its type as one of: ' +
    REVIEW_THEME_TYPES.join(", ") +
    ".\n" +
    "Do NOT invent themes, change counts, or merge distinct ids. Return ONLY a JSON array of " +
    '{"id":number,"name":string,"type":string}, one object per input theme.\n\n' +
    JSON.stringify(themeFacts);

  try {
    const { value } = await cachedJson<Array<{ id: unknown; name: unknown; type: unknown }>>(
      "review_clusters",
      subjectId,
      input,
      () => generate(prompt, { json: true, priority: "user" }),
    );
    if (!Array.isArray(value)) return null;
    const map = new Map<number, ThemeEnrichment>();
    for (const row of value) {
      const id = typeof row?.id === "number" ? row.id : Number(row?.id);
      const name = typeof row?.name === "string" ? row.name.trim() : "";
      const type = row?.type;
      if (!Number.isInteger(id) || id < 0 || id >= top.length || name.length === 0) continue;
      const deterministic = top[id];
      if (!deterministic) continue;
      // Keep the deterministic type unless the model returns a valid enum value.
      const resolvedType = REVIEW_THEME_TYPES.includes(type as ReviewThemeType)
        ? (type as ReviewThemeType)
        : deterministic.type;
      map.set(id, { name, type: resolvedType });
    }
    return map.size > 0 ? { map, modelVersion: GEMINI_MODEL } : null;
  } catch {
    // No key / quota exhausted / unparseable — degrade to the deterministic base.
    return null;
  }
}

/**
 * find_feature_gaps intelligence (#260) — orchestration. Resolves a competitor
 * set, pulls each app's listing description (→ coverage) and the SAME set's review
 * themes via the #259 `cluster_reviews` service (→ demand + quality), builds the
 * deterministic feature × competitor matrix with `@kittie/intelligence`, then
 * OPTIONALLY sharpens feature names through the cached Gemini seam. Demand signal
 * is composed from cluster_reviews (never re-implemented); any failure degrades
 * honestly to listing-only coverage.
 */
import type {
  FeatureGap,
  FeatureGapsIntelligenceResponse,
  FindFeatureGapsRequest,
  FindSimilarAppsInput,
  FindSimilarAppsResult,
  ReviewTheme,
  Store,
} from "@kittie/types";
import {
  buildFeatureGapsResponse,
  findFeatureGapsDeterministic,
  FEATURE_GAP_DEFAULTS,
  type FeatureInputApp,
} from "@kittie/intelligence";
import { listAppsByIds } from "@kittie/db";
import { getDb } from "../lib/db.js";
import { cachedJson, generate, hashInput, isGeminiConfigured, GEMINI_MODEL } from "../lib/gemini.js";
import { findSimilarApps, SimilarAppsError } from "./similar-apps-service.js";
import { getReviewClusters } from "./review-clusters-service.js";

export class FeatureGapsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "FeatureGapsError";
  }
}

export interface FeatureGapsEnrichment {
  /** index → sharpened feature name. */
  names: Map<number, string>;
  modelVersion: string;
}

export interface FeatureGapsDeps {
  findSimilarApps(input: FindSimilarAppsInput): Promise<FindSimilarAppsResult>;
  resolveApps(ids: string[]): Promise<FeatureInputApp[]>;
  fetchReviewThemes(
    ids: string[],
    country: string,
    limitApps: number,
  ): Promise<{
    themes: ReviewTheme[];
    reviewsAnalyzed: number;
    /** Propagated cluster sourceCoverage bits (#271); absent on degrade. */
    reviewDateRange?: { oldest: string; newest: string } | null;
    localesSeen?: string[];
    appsWithReviews?: number;
  }>;
  enrich(apps: FeatureInputApp[], features: FeatureGap[]): Promise<FeatureGapsEnrichment | null>;
  now(): Date;
}

const defaultDeps: FeatureGapsDeps = {
  findSimilarApps,
  resolveApps: async (ids) => {
    const rows = await listAppsByIds(getDb(), ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .filter((id) => byId.has(id))
      .map<FeatureInputApp>((id) => {
        const r = byId.get(id)!;
        return { id, name: r.title, description: r.description ?? null, category: r.category ?? null };
      });
  },
  fetchReviewThemes: async (ids, country, limitApps) => {
    // Compose #259 — its own cache + honest degradation apply. Never re-cluster here.
    try {
      const res = await getReviewClusters({ appIds: ids, country, limitApps, maxReviewsPerApp: 100 });
      const sc = res.data.sourceCoverage;
      return {
        themes: res.data.themes,
        reviewsAnalyzed: res.data.totalReviewsAnalyzed,
        reviewDateRange: sc.reviewDateRange,
        localesSeen: sc.localesSeen,
        appsWithReviews: sc.appsWithReviews,
      };
    } catch {
      // Review path unavailable → feature gaps still work on listing coverage alone.
      return { themes: [], reviewsAnalyzed: 0 };
    }
  },
  enrich: geminiSharpenFeatures,
  now: () => new Date(),
};

function clampInt(value: number | undefined, def: number, min: number, max: number): number {
  if (value === undefined || Number.isNaN(value)) return def;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normaliseStore(store: unknown): Store | undefined {
  return store === "apple" || store === "google" ? store : undefined;
}

export async function getFeatureGaps(
  input: FindFeatureGapsRequest,
  deps: FeatureGapsDeps = defaultDeps,
): Promise<FeatureGapsIntelligenceResponse> {
  const explicitIds = Array.isArray(input.appIds)
    ? input.appIds.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0)
    : [];
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (explicitIds.length === 0 && query.length === 0) {
    throw new FeatureGapsError("provide a `query` (niche description) or an `appIds` array");
  }
  if (input.store !== undefined && normaliseStore(input.store) === undefined) {
    throw new FeatureGapsError('`store` must be "apple" or "google"');
  }

  const limitApps = clampInt(input.limitApps, FEATURE_GAP_DEFAULTS.limitApps, 1, FEATURE_GAP_DEFAULTS.maxLimitApps);
  const country = input.country?.trim() || "US";

  // ── resolve the competitor set (explicit ids win over discovery) ─────────
  let ids: string[];
  if (explicitIds.length > 0) {
    ids = explicitIds.slice(0, FEATURE_GAP_DEFAULTS.maxLimitApps);
  } else {
    let similar: FindSimilarAppsResult;
    try {
      similar = await deps.findSimilarApps({ query, store: normaliseStore(input.store), limit: limitApps });
    } catch (err) {
      if (err instanceof SimilarAppsError) throw new FeatureGapsError(err.message, err.status);
      throw err;
    }
    ids = similar.similar.slice(0, limitApps).map((s) => s.app.id);
    if (ids.length === 0) {
      throw new FeatureGapsError("no competitors matched that query — refine it or pass explicit appIds", 404);
    }
  }

  const apps = await deps.resolveApps(ids);
  if (apps.length === 0) {
    throw new FeatureGapsError("none of the provided appIds resolved to a known app", 404);
  }

  // ── demand from #259 (unless the caller opted out) ──────────────────────
  const useReviews = input.includeReviewSignals !== false;
  const reviewMeta = useReviews
    ? await deps.fetchReviewThemes(apps.map((a) => a.id), country, limitApps)
    : { themes: [] as ReviewTheme[], reviewsAnalyzed: 0 };
  const { themes, reviewsAnalyzed } = reviewMeta;

  const params: FindFeatureGapsRequest = {
    query: query || undefined,
    country,
    limitApps,
    includeReviewSignals: input.includeReviewSignals,
    includeDescriptionSignals: input.includeDescriptionSignals,
    minDemand: input.minDemand,
  };
  const base = findFeatureGapsDeterministic({ apps, themes, params });

  // ── optional LLM name-sharpening (counts stay deterministic) ─────────────
  let features = base.features;
  let enrichment: "llm" | "deterministic" = "deterministic";
  let modelVersion: string | null = null;
  if (base.features.length > 0) {
    const enriched = await deps.enrich(apps, base.features);
    if (enriched && enriched.names.size > 0) {
      features = base.features.map((f, i) => {
        const name = enriched.names.get(i);
        return name ? { ...f, feature: name } : f;
      });
      enrichment = "llm";
      modelVersion = enriched.modelVersion;
    }
  }

  const now = deps.now();
  return buildFeatureGapsResponse({
    features,
    coverage: base.coverage,
    reviewsAnalyzed,
    reviewDateRange: reviewMeta.reviewDateRange ?? null,
    localesSeen: reviewMeta.localesSeen ?? [],
    appsWithReviews: reviewMeta.appsWithReviews ?? 0,
    apps,
    params,
    enrichment,
    generatedAt: now.toISOString(),
    modelVersion,
  });
}

/* ---- Gemini name-sharpening seam ---------------------------------------- */

const MAX_ENRICH_FEATURES = FEATURE_GAP_DEFAULTS.maxEvidenceFeatures;

/**
 * Ask Gemini for a category-specific name for each generic lexicon feature,
 * using the app category + a couple of evidence snippets. Cached on the facts
 * fed. Returns `null` (→ deterministic names) when unconfigured or on any
 * call/parse failure. The model renames only; it never adds or reorders features.
 */
async function geminiSharpenFeatures(
  apps: FeatureInputApp[],
  features: FeatureGap[],
): Promise<FeatureGapsEnrichment | null> {
  if (!isGeminiConfigured()) return null;
  const top = features.slice(0, MAX_ENRICH_FEATURES);
  if (top.length === 0) return null;

  const category = apps.find((a) => a.category)?.category ?? "mobile apps";
  const featureFacts = top.map((f, id) => ({
    id,
    feature: f.feature,
    coverage: f.coverage,
    demand: f.demand,
    gap: f.gap,
    evidence: f.evidence.slice(0, 2).map((e) => e.text),
  }));
  const sortedIds = apps.map((a) => a.id).sort();
  const subjectId = `featuregaps:${hashInput(sortedIds.join(","))}`;
  const input = JSON.stringify({ v: 1, category, apps: sortedIds, features: featureFacts });

  const prompt =
    `You are naming features in a competitor matrix for the "${category}" app category.\n` +
    "For each generic feature below, return a SPECIFIC, category-appropriate name (≤6 words) that a " +
    "product team would recognise — keep the generic one if it is already specific enough. Do NOT add, " +
    "remove, merge, reorder, or renumber features, and do not change any numbers.\n" +
    'Return ONLY a JSON array of {"id":number,"name":string}, one per input feature.\n\n' +
    JSON.stringify(featureFacts);

  try {
    const { value } = await cachedJson<Array<{ id: unknown; name: unknown }>>(
      "feature_gaps",
      subjectId,
      input,
      () => generate(prompt, { json: true, priority: "user" }),
    );
    if (!Array.isArray(value)) return null;
    const names = new Map<number, string>();
    for (const row of value) {
      const id = typeof row?.id === "number" ? row.id : Number(row?.id);
      const name = typeof row?.name === "string" ? row.name.trim() : "";
      if (!Number.isInteger(id) || id < 0 || id >= top.length || name.length === 0) continue;
      names.set(id, name);
    }
    return names.size > 0 ? { names, modelVersion: GEMINI_MODEL } : null;
  } catch {
    return null;
  }
}

/**
 * rank_whitespace_ideas intelligence (#261) — orchestration. The bounded
 * candidate funnel that turns a category into ranked opportunity niches:
 *
 *   1. GENERATE candidates (deterministic, cheap): caller seedIdeas + store
 *      autocomplete keywords seeded from the category. LLM never invents them.
 *   2. PRE-FILTER (deterministic, cheap): resolve competitors per candidate via
 *      find_similar_apps (DB-only) and score the prior with `prefilterScore`.
 *      No review fetch, no LLM. Candidates with zero competitors drop out
 *      (counted in the funnel — nothing truncates silently).
 *   3. DEEP CASCADE (bounded to top-K = `limit`): run the #259 cluster_reviews
 *      and #260 find_feature_gaps SERVICES over each survivor's competitor ids
 *      (both cache-through), then score with the pure `scoreWhitespaceIdea`.
 *   4. OPTIONAL LLM phrasing: relabel niches / reword build angles through the
 *      cached Gemini seam. Numbers are never model-touched; failure degrades to
 *      the deterministic templates.
 */
import type {
  FeatureGap,
  FindSimilarAppsInput,
  FindSimilarAppsResult,
  RankWhitespaceIdeasRequest,
  ReviewTheme,
  SimilarApp,
  Store,
  WhitespaceIdea,
  WhitespaceIdeasIntelligenceResponse,
} from "@kittie/types";
import {
  buildWhitespaceIdeasResponse,
  prefilterScore,
  scoreWhitespaceIdea,
  WHITESPACE_DEFAULTS,
} from "@kittie/intelligence";
import { cachedJson, generate, hashInput, isGeminiConfigured, GEMINI_MODEL } from "../lib/gemini.js";
import { findSimilarApps, SimilarAppsError } from "./similar-apps-service.js";
import { getReviewClusters } from "./review-clusters-service.js";
import { getFeatureGaps } from "./feature-gaps-service.js";
import { getRelatedKeywords } from "./keyword-service.js";

export class WhitespaceIdeasError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "WhitespaceIdeasError";
  }
}

export interface WhitespacePhrasing {
  /** index → { niche label, build angle }. */
  map: Map<number, { niche?: string; angle?: string }>;
  modelVersion: string;
}

export interface WhitespaceDeps {
  /** Candidate phrases from store autocomplete for a seed term. */
  relatedKeywords(seed: string, country: string, store: Store, limit: number): Promise<string[]>;
  findSimilarApps(input: FindSimilarAppsInput): Promise<FindSimilarAppsResult>;
  /** #259 themes for an explicit competitor set (cached service). */
  fetchThemes(
    appIds: string[],
    country: string,
  ): Promise<{
    themes: ReviewTheme[];
    reviewsAnalyzed: number;
    /** Propagated cluster sourceCoverage bits (#271); absent on degrade. */
    appsWithReviews?: number;
    reviewDateRange?: { oldest: string; newest: string } | null;
    localesSeen?: string[];
  }>;
  /** #260 features for the same set (cached service). */
  fetchFeatures(appIds: string[], country: string): Promise<FeatureGap[]>;
  /** Optional LLM phrasing; null → deterministic templates. */
  phrase(category: string, ideas: WhitespaceIdea[]): Promise<WhitespacePhrasing | null>;
  now(): Date;
}

const defaultDeps: WhitespaceDeps = {
  relatedKeywords: async (seed, country, store, limit) => {
    try {
      return await getRelatedKeywords(seed, country, store, limit);
    } catch {
      return []; // autocomplete unavailable → seeds alone carry the funnel
    }
  },
  findSimilarApps,
  fetchThemes: async (appIds, country) => {
    try {
      const res = await getReviewClusters({ appIds, country, maxReviewsPerApp: 100 });
      const sc = res.data.sourceCoverage;
      return {
        themes: res.data.themes,
        reviewsAnalyzed: res.data.totalReviewsAnalyzed,
        appsWithReviews: sc.appsWithReviews,
        reviewDateRange: sc.reviewDateRange,
        localesSeen: sc.localesSeen,
      };
    } catch {
      return { themes: [], reviewsAnalyzed: 0 };
    }
  },
  fetchFeatures: async (appIds, country) => {
    try {
      const res = await getFeatureGaps({ appIds, country });
      return res.data.features;
    } catch {
      return [];
    }
  },
  phrase: geminiPhraseIdeas,
  now: () => new Date(),
};

function clampInt(value: number | undefined, def: number, min: number, max: number): number {
  if (value === undefined || Number.isNaN(value)) return def;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normaliseCandidate(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getWhitespaceIdeas(
  input: RankWhitespaceIdeasRequest,
  deps: WhitespaceDeps = defaultDeps,
): Promise<WhitespaceIdeasIntelligenceResponse> {
  const category = typeof input.category === "string" ? input.category.trim() : "";
  if (!category) {
    throw new WhitespaceIdeasError("provide a `category` (the space to generate sub-niches for)");
  }
  if (input.store !== undefined && input.store !== "apple" && input.store !== "google") {
    throw new WhitespaceIdeasError('`store` must be "apple" or "google"');
  }
  const limit = clampInt(input.limit, WHITESPACE_DEFAULTS.limit, 1, WHITESPACE_DEFAULTS.maxLimit);
  const country = input.country?.trim() || "US";
  const store: Store = input.store ?? "apple";

  // ── 1. candidates (seeds + autocomplete; deduped, bounded) ───────────────
  const seeds = Array.isArray(input.seedIdeas)
    ? input.seedIdeas.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const keywords = await deps.relatedKeywords(category, country, store, WHITESPACE_DEFAULTS.maxCandidates);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of [...seeds, ...keywords]) {
    const c = normaliseCandidate(raw);
    if (!c || c === normaliseCandidate(category) || seen.has(c)) continue;
    seen.add(c);
    candidates.push(c);
    if (candidates.length >= WHITESPACE_DEFAULTS.maxCandidates) break;
  }
  // The category itself is always a candidate of last resort.
  if (candidates.length === 0) candidates.push(normaliseCandidate(category));

  // ── 2. pre-filter (DB-only retrieval + cheap prior) ─────────────────────
  const prefiltered: Array<{ niche: string; competitors: SimilarApp[]; prior: number }> = [];
  for (const niche of candidates) {
    let similar: FindSimilarAppsResult;
    try {
      similar = await deps.findSimilarApps({ query: niche, store: input.store, limit: WHITESPACE_DEFAULTS.competitorsPerNiche });
    } catch (err) {
      if (err instanceof SimilarAppsError) continue; // unresolvable candidate → drops out (funnel-counted)
      throw err;
    }
    const competitors = similar.similar.slice(0, WHITESPACE_DEFAULTS.competitorsPerNiche);
    if (competitors.length === 0) continue;
    prefiltered.push({ niche, competitors, prior: prefilterScore(competitors) });
  }
  prefiltered.sort((a, b) => b.prior - a.prior || a.niche.localeCompare(b.niche));

  // ── 3. deep cascade on the top-K only ────────────────────────────────────
  const survivors = prefiltered.slice(0, limit);
  let ideas: WhitespaceIdea[] = [];
  // Aggregated sourceCoverage across the deep-analysed set (#271).
  const deepAppIds = new Set<string>();
  let aggAppsWithReviews = 0;
  let aggReviews = 0;
  let aggOldest: string | null = null;
  let aggNewest: string | null = null;
  const aggLocales = new Set<string>();
  for (const s of survivors) {
    const appIds = s.competitors.map((c) => c.app.id);
    const [meta, features] = [
      await deps.fetchThemes(appIds, country),
      await deps.fetchFeatures(appIds, country),
    ];
    const { themes, reviewsAnalyzed } = meta;
    for (const id of appIds) deepAppIds.add(id);
    aggAppsWithReviews += meta.appsWithReviews ?? 0;
    aggReviews += reviewsAnalyzed;
    if (meta.reviewDateRange) {
      if (aggOldest === null || meta.reviewDateRange.oldest < aggOldest) aggOldest = meta.reviewDateRange.oldest;
      if (aggNewest === null || meta.reviewDateRange.newest > aggNewest) aggNewest = meta.reviewDateRange.newest;
    }
    for (const l of meta.localesSeen ?? []) aggLocales.add(l);
    ideas.push(scoreWhitespaceIdea({ niche: s.niche, competitors: s.competitors, themes, features, reviewsAnalyzed }));
  }
  const minConfidence = typeof input.minConfidence === "number" ? Math.min(Math.max(input.minConfidence, 0), 1) : 0;
  ideas = ideas
    .filter((i) => i.confidence >= minConfidence)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.niche.localeCompare(b.niche));

  // ── 4. optional LLM phrasing (labels/angles only; numbers untouched) ─────
  let enrichment: "llm" | "deterministic" = "deterministic";
  let modelVersion: string | null = null;
  if (ideas.length > 0) {
    const phrased = await deps.phrase(category, ideas);
    if (phrased && phrased.map.size > 0) {
      ideas = ideas.map((idea, i) => {
        const p = phrased.map.get(i);
        if (!p) return idea;
        return { ...idea, niche: p.niche?.trim() || idea.niche, suggestedBuildAngle: p.angle?.trim() || idea.suggestedBuildAngle };
      });
      enrichment = "llm";
      modelVersion = phrased.modelVersion;
    }
  }

  return buildWhitespaceIdeasResponse({
    ideas,
    funnel: { candidates: candidates.length, prefiltered: prefiltered.length, deepAnalyzed: survivors.length },
    sourceCoverage: {
      appsResolved: deepAppIds.size,
      appsWithReviews: aggAppsWithReviews,
      reviewsAnalyzed: aggReviews,
      reviewDateRange: aggOldest && aggNewest ? { oldest: aggOldest, newest: aggNewest } : null,
      localesSeen: [...aggLocales].sort(),
    },
    params: { category, country, limit, seedIdeas: seeds.length > 0 ? seeds : undefined },
    enrichment,
    generatedAt: deps.now().toISOString(),
    modelVersion,
  });
}

/* ---- Gemini phrasing seam ------------------------------------------------ */

/**
 * Ask Gemini to phrase each niche label + build angle from the deterministic
 * evidence. Cached on the facts fed. Returns `null` (→ templated wording) when
 * unconfigured or on any call/parse failure. The model rewords only — it never
 * adds, removes, reorders or rescores ideas.
 */
async function geminiPhraseIdeas(
  category: string,
  ideas: WhitespaceIdea[],
): Promise<WhitespacePhrasing | null> {
  if (!isGeminiConfigured() || ideas.length === 0) return null;

  const facts = ideas.map((idea, id) => ({
    id,
    niche: idea.niche,
    score: idea.score,
    demand: idea.demand,
    incumbents: idea.incumbentStrength,
    evidence: idea.evidence.map((e) => e.text).slice(0, 3),
    templatedAngle: idea.suggestedBuildAngle,
  }));
  const subjectId = `whitespace:${hashInput(`${category}:${ideas.map((i) => i.niche).join("|")}`)}`;
  const inputStr = JSON.stringify({ v: 1, category, facts });

  const prompt =
    `You are labelling ranked app-opportunity niches in the "${category}" space for a market-intelligence API.\n` +
    "For each idea below, return a crisp niche label (≤5 words) and a one-sentence build angle grounded ONLY " +
    "in the evidence given. Do NOT add, remove, reorder or renumber ideas, and never change scores or invent " +
    'facts. Return ONLY a JSON array of {"id":number,"niche":string,"angle":string}.\n\n' +
    JSON.stringify(facts);

  try {
    const { value } = await cachedJson<Array<{ id: unknown; niche: unknown; angle: unknown }>>(
      "whitespace_ideas",
      subjectId,
      inputStr,
      () => generate(prompt, { json: true, priority: "user" }),
    );
    if (!Array.isArray(value)) return null;
    const map = new Map<number, { niche?: string; angle?: string }>();
    for (const row of value) {
      const id = typeof row?.id === "number" ? row.id : Number(row?.id);
      if (!Number.isInteger(id) || id < 0 || id >= ideas.length) continue;
      const niche = typeof row?.niche === "string" && row.niche.trim() ? row.niche.trim() : undefined;
      const angle = typeof row?.angle === "string" && row.angle.trim() ? row.angle.trim() : undefined;
      if (niche || angle) map.set(id, { niche, angle });
    }
    return map.size > 0 ? { map, modelVersion: GEMINI_MODEL } : null;
  } catch {
    return null;
  }
}

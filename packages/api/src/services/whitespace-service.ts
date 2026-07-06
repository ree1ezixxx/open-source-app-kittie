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
    /** Propagated cluster coverage bits (#271); absent on degrade. Per-app
        counts (not a bare sum) so overlapping niche sets dedup exactly. */
    perAppReviews?: Array<{ appId: string; reviewsAnalyzed: number }>;
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
        perAppReviews: res.data.coverage.map((c) => ({ appId: c.appId, reviewsAnalyzed: c.reviewsAnalyzed })),
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
  const seedSet = new Set(seeds.map((x) => normaliseCandidate(x)));
  let refused = 0;
  // Coherence gate (#274): a NON-SEED candidate must share content tokens with
  // the requested category, else autocomplete noise walks straight into the
  // funnel (the "zzqx flurbin widgets → ok ideas" smoke failure). Seeds encode
  // caller intent and are never coherence-refused (evidence rungs still apply).
  const categoryTokens = new Set(normaliseCandidate(category).split(" ").filter((t) => t.length > 2));
  const isCoherent = (c: string): boolean => {
    if (seedSet.has(c)) return true;
    const overlap = c.split(" ").filter((t) => t.length > 2 && categoryTokens.has(t)).length;
    return overlap >= WHITESPACE_DEFAULTS.gates.coherenceMinOverlap;
  };
  for (const raw of [...seeds, ...keywords]) {
    const c = normaliseCandidate(raw);
    if (!c || c === normaliseCandidate(category) || seen.has(c)) continue;
    seen.add(c);
    if (!isCoherent(c)) {
      refused += 1;
      continue;
    }
    candidates.push(c);
    if (candidates.length >= WHITESPACE_DEFAULTS.maxCandidates) break;
  }
  // The category itself is always a candidate of last resort.
  if (candidates.length === 0) candidates.push(normaliseCandidate(category));

  // ── category grounding (#274 cold-verify BLOCKER) ────────────────────────
  // The per-candidate coherence check is CIRCULAR against a nonsense category:
  // autocomplete mines the corpus BY the category's real tokens, so a single
  // real word ("widgets") in "zzqx flurbin widgets" made every candidate
  // self-coherent and the response ranked garbage. Ground the CATEGORY itself:
  // the majority of its content tokens must be echoed by market evidence
  // (autocomplete keywords). Ungrounded → refuse the whole funnel before any
  // deep spend; the response is insufficient with the dead tokens named.
  const keywordHay = keywords.map((k) => normaliseCandidate(k)).join(" ");
  const keywordTokens = new Set(keywordHay.split(" ").filter((t) => t.length > 2));
  const catTokens = [...categoryTokens];
  const ungroundedTokens = catTokens.filter((t) => !keywordTokens.has(t));
  const categoryGrounded =
    seeds.length > 0 || // caller-supplied seeds encode intent — never funnel-refused
    keywords.length === 0 || // no autocomplete signal → the zero-competitor path judges it
    catTokens.length === 0 ||
    ungroundedTokens.length / catTokens.length < 0.5;
  if (!categoryGrounded) {
    return buildWhitespaceIdeasResponse({
      ideas: [],
      funnel: { candidates: candidates.length, prefiltered: 0, deepAnalyzed: 0, refused: refused + candidates.length },
      params: { category, country, limit },
      enrichment: "deterministic",
      generatedAt: deps.now().toISOString(),
      modelVersion: null,
      ungroundedCategoryTokens: ungroundedTokens,
    });
  }

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
  // Per-app dedup (#271 cold-verify): niches' competitor sets overlap in normal
  // operation — summing per-niche counts overstated appsWithReviews (could
  // exceed the deduped appsResolved) and masked partial coverage. Same app
  // across niches yields the same capped rows, so keep the max per app.
  const reviewsByApp = new Map<string, number>();
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
    for (const pa of meta.perAppReviews ?? []) {
      reviewsByApp.set(pa.appId, Math.max(reviewsByApp.get(pa.appId) ?? 0, pa.reviewsAnalyzed));
    }
    if (meta.reviewDateRange) {
      if (aggOldest === null || meta.reviewDateRange.oldest < aggOldest) aggOldest = meta.reviewDateRange.oldest;
      if (aggNewest === null || meta.reviewDateRange.newest > aggNewest) aggNewest = meta.reviewDateRange.newest;
    }
    for (const l of meta.localesSeen ?? []) aggLocales.add(l);
    ideas.push(scoreWhitespaceIdea({ niche: s.niche, competitors: s.competitors, themes, features, reviewsAnalyzed }));
  }
  const minConfidence = typeof input.minConfidence === "number" ? Math.min(Math.max(input.minConfidence, 0), 1) : 0;
  const beforeConfidenceFilter = ideas.length;
  ideas = ideas
    .filter((i) => i.confidence >= minConfidence)
    // Scored rungs first (by score), then needs_more_sources (unranked) at the end.
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) || b.confidence - a.confidence || a.niche.localeCompare(b.niche),
    );

  // ── 4. optional LLM phrasing (labels/angles only; numbers untouched) ─────
  let enrichment: "llm" | "deterministic" = "deterministic";
  let modelVersion: string | null = null;
  const phrasable = ideas.filter((i) => i.gateRung !== "needs_more_sources");
  if (phrasable.length > 0) {
    const phrased = await deps.phrase(category, phrasable);
    if (phrased && phrased.map.size > 0) {
      const phrasedByNiche = new Map<string, { niche?: string; angle?: string }>();
      phrasable.forEach((idea, i) => {
        const p = phrased.map.get(i);
        if (p) phrasedByNiche.set(idea.niche, p);
      });
      ideas = ideas.map((idea) => {
        const p = phrasedByNiche.get(idea.niche);
        if (!p || idea.gateRung === "needs_more_sources") return idea;
        return { ...idea, niche: p.niche?.trim() || idea.niche, suggestedBuildAngle: p.angle?.trim() || idea.suggestedBuildAngle };
      });
      enrichment = "llm";
      modelVersion = phrased.modelVersion;
    }
  }

  return buildWhitespaceIdeasResponse({
    ideas,
    funnel: {
      candidates: candidates.length,
      prefiltered: prefiltered.length,
      deepAnalyzed: survivors.length,
      // minConfidence drops are refusals too — nothing vanishes silently.
      refused: refused + (beforeConfidenceFilter - ideas.length),
    },
    sourceCoverage: {
      appsResolved: deepAppIds.size,
      appsWithReviews: [...reviewsByApp.values()].filter((n) => n > 0).length,
      reviewsAnalyzed: [...reviewsByApp.values()].reduce((a, b) => a + b, 0),
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
    score: idea.score ?? null,
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

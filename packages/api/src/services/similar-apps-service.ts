/**
 * find_similar_apps — orchestration. Composes the deterministic retrieval passes
 * (DB) with the pure scoring core (`@kittie/intelligence/similarity`) into a
 * `FindSimilarAppsResult`.
 *
 * Passes (PRD §6):
 *  1. FTS keyword — multi-keyword OR-union. Ideas are phrases; `toFtsMatch`
 *     AND-joins tokens, which under-recalls ("sobriety coach" needs BOTH in one
 *     title), so we search each keyword separately and union, weighting an app
 *     by how many keywords it hit and its best rank.
 *  2. Category peers — top apps in the idea's category. The category is matched
 *     from facet names or, failing that, INFERRED from the modal category of the
 *     FTS hits (deterministic, observed), which also lets us classify "direct".
 *  3. Keyword-cluster overlap — computed in the pure core from title/category
 *     tokens (no per-app keyword index exists in the schema).
 *  4. Review-topic overlap — bounded to the strongest candidates.
 * Scores are deterministic; no LLM on this path.
 */
import type {
  AppListItem,
  FindSimilarAppsInput,
  FindSimilarAppsResult,
  InterpretedIdea,
} from "@kittie/types";
import { getAppRowById, getRecentReviewTagsForApps } from "@kittie/db";
import {
  buildSimilarAgentSummary,
  classifyReview,
  computeSimilarConfidence,
  interpretFromApp,
  interpretFromQuery,
  rankSimilar,
  type SimilarCandidate,
} from "@kittie/intelligence";
import { getDb } from "../lib/db.js";
import { listCategoryFacetsFromDb, searchAppCandidates } from "./app-query.js";
import { buildScoredAppRows } from "./app-list-scoring.js";

/** Thrown for caller errors; the route maps `.status` to the HTTP code. */
export class SimilarAppsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "SimilarAppsError";
  }
}

/** How many candidates each retrieval pass pulls before dedup + rerank. */
const RETRIEVE = 60;
/** Cap the (heavier) review-topic pass to the strongest candidates. */
const REVIEW_TOPIC_CAP = 30;
/** Max keywords fed into the FTS OR-union (bounds query count). */
const MAX_FTS_TERMS = 6;
/** Approximate catalog size — the IDF reference for term-rarity weighting. */
const CATALOG_REF = 1_100_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export async function findSimilarApps(
  input: FindSimilarAppsInput,
): Promise<FindSimilarAppsResult> {
  const db = getDb();
  const limit = clamp(input.limit ?? 20, 1, 50);
  const store = input.store;
  const missing: string[] = [];

  // ── 1. Interpret the idea (deterministic) ──
  let interpreted: InterpretedIdea;
  let ftsText: string;
  const selfId = input.appId ?? null;
  if (input.appId) {
    const app = await getAppRowById(db, input.appId);
    if (!app) throw new SimilarAppsError(`app not found: ${input.appId}`, 404);
    interpreted = interpretFromApp({ title: app.title, category: app.category });
    ftsText = app.title;
  } else if (input.query && input.query.trim()) {
    const facets = await listCategoryFacetsFromDb();
    interpreted = interpretFromQuery(
      input.query,
      facets.map((f) => f.name),
    );
    ftsText = input.query;
  } else {
    throw new SimilarAppsError("provide either `query` (free text) or `appId`", 400);
  }
  if (interpreted.keywords.length === 0) {
    missing.push("no usable keywords parsed from the idea");
  }

  // ── 2. FTS pass: multi-keyword OR-union ──
  const terms = interpreted.keywords.slice(0, MAX_FTS_TERMS);
  const ftsPools = await Promise.all(
    terms.map((t) => searchAppCandidates({ search: t, source: store, limit: RETRIEVE })),
  );
  // IDF-weight terms by rarity: a rare keyword ("sobriety", ~45 apps) is far more
  // discriminative than a common one ("coach", thousands), so a match on it counts
  // for more — and an app matching the rare term outranks generic namesakes. df per
  // term = its FTS totalCount; weights normalised to sum 1 so ftsScore stays 0..1.
  const idf = terms.map((_, i) => {
    const df = ftsPools[i]?.totalCount ?? 0;
    return Math.log((CATALOG_REF + 1) / (df + 1));
  });
  const idfSum = idf.reduce((a, b) => a + b, 0) || 1;
  const termWeight = idf.map((w) => w / idfSum);

  const ftsAcc = new Map<string, number>();
  let marketCountry = "US";
  ftsPools.forEach((pool, i) => {
    if (!pool) return;
    marketCountry = pool.marketCountry;
    const w = termWeight[i] ?? 0;
    const len = Math.max(1, pool.ids.length);
    pool.ids.forEach((id, r) => {
      const rankW = 1 - r / len;
      ftsAcc.set(id, (ftsAcc.get(id) ?? 0) + w * rankW);
    });
  });
  const ftsScoreOf = (id: string): number => Number((ftsAcc.get(id) ?? 0).toFixed(4));
  const ftsIdList = [...ftsAcc.keys()].filter((id) => id !== selfId);

  // hydrate FTS hits (full market signals)
  const itemById = new Map<string, AppListItem>();
  if (ftsIdList.length) {
    const rows = await buildScoredAppRows(ftsIdList, "7d", marketCountry, new Map());
    for (const r of rows) itemById.set(r.item.id, r.item);
  }

  // ── infer category from the modal category of the strongest FTS hits ──
  if (interpreted.categories.length === 0) {
    const inferred = inferCategories(ftsIdList, ftsScoreOf, itemById);
    if (inferred.length) interpreted = { ...interpreted, categories: inferred };
  }

  // ── 3. Category-peer pass ──
  const catIds = new Set<string>();
  if (interpreted.categories.length) {
    const catPool = await searchAppCandidates({
      categories: interpreted.categories.join(","),
      source: store,
      sortBy: "reviews",
      sortOrder: "desc",
      limit: RETRIEVE,
    });
    for (const id of catPool?.ids ?? []) {
      if (id !== selfId) catIds.add(id);
    }
    const newIds = [...catIds].filter((id) => !itemById.has(id));
    if (newIds.length) {
      const more = await buildScoredAppRows(newIds, "7d", marketCountry, new Map());
      for (const r of more) itemById.set(r.item.id, r.item);
    }
  } else {
    missing.push("no catalog category matched the idea (category-peer pass skipped)");
  }

  const unionIds = [...new Set([...ftsIdList, ...catIds])].filter(
    (id) => id !== selfId && itemById.has(id),
  );
  if (unionIds.length === 0) {
    return {
      interpretedQuery: interpreted,
      similar: [],
      confidence: computeSimilarConfidence([], missing),
      missing,
      agentSummary: buildSimilarAgentSummary(interpreted, [], missing),
    };
  }

  // ── 4. Review-topic overlap (bounded to strongest candidates) ──
  const byStrength = [...unionIds].sort((a, b) => ftsScoreOf(b) - ftsScoreOf(a));
  const reviewTopicScores = await computeReviewTopicScores(
    selfId,
    ftsText,
    byStrength.slice(0, REVIEW_TOPIC_CAP),
    missing,
  );

  // ── 5. Assemble candidates → pure rerank/classify ──
  const candidates: SimilarCandidate[] = [];
  for (const id of unionIds) {
    const app = itemById.get(id);
    if (!app) continue;
    candidates.push({
      app,
      ftsScore: ftsScoreOf(id),
      categoryPeer: catIds.has(id),
      reviewTopicScore: reviewTopicScores.get(id) ?? 0,
    });
  }

  const similar = rankSimilar(candidates, interpreted, limit);
  return {
    interpretedQuery: interpreted,
    similar,
    confidence: computeSimilarConfidence(similar, missing),
    missing,
    agentSummary: buildSimilarAgentSummary(interpreted, similar, missing),
  };
}

/** Modal category(ies) among the strongest FTS hits — deterministic category inference. */
function inferCategories(
  ids: string[],
  ftsScoreOf: (id: string) => number,
  itemById: Map<string, AppListItem>,
  topN = 25,
  take = 2,
): string[] {
  const ranked = [...ids].sort((a, b) => ftsScoreOf(b) - ftsScoreOf(a)).slice(0, topN);
  const freq = new Map<string, number>();
  for (const id of ranked) {
    const cat = itemById.get(id)?.category;
    if (cat) freq.set(cat, (freq.get(cat) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .filter(([, n]) => n >= 2) // need a real cluster, not a single stray hit
    .map(([c]) => c);
}

/**
 * Per-candidate review-topic overlap (0..1). Anchor themes come from the seed
 * app's own reviews (observed) or, for a free-text idea, from classifying the
 * idea text onto the same taxonomy. Jaccard overlap of the combined
 * topic+improvement-area sets. Returns an empty map (all 0) when no anchor
 * themes exist — and records that honestly in `missing`.
 */
async function computeReviewTopicScores(
  seedAppId: string | null,
  queryText: string,
  candidateIds: string[],
  missing: string[],
): Promise<Map<string, number>> {
  const db = getDb();
  const scores = new Map<string, number>();

  let anchor: Set<string>;
  if (seedAppId) {
    const seedTags = (await getRecentReviewTagsForApps(db, [seedAppId], 80)).get(seedAppId);
    anchor = new Set([...(seedTags?.topics ?? []), ...(seedTags?.improvementAreas ?? [])]);
  } else {
    const tags = classifyReview({ rating: 1, title: null, body: queryText });
    anchor = new Set([...tags.topics, ...tags.improvementAreas]);
  }

  if (anchor.size === 0) {
    missing.push(
      seedAppId
        ? "seed app has no classified review themes (review-topic pass skipped)"
        : "idea text maps to no known review themes (review-topic pass skipped)",
    );
    return scores;
  }

  const tagsByApp = await getRecentReviewTagsForApps(db, candidateIds, 50);
  for (const [id, tags] of tagsByApp) {
    const cand = new Set([...tags.topics, ...tags.improvementAreas]);
    if (cand.size === 0) continue;
    let inter = 0;
    for (const t of cand) if (anchor.has(t)) inter++;
    const union = new Set([...anchor, ...cand]).size;
    if (inter > 0) scores.set(id, Number((inter / union).toFixed(4)));
  }
  return scores;
}

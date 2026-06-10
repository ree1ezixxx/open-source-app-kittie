import {
  listAppIdsByCategory,
  listKeywordIndexRows,
  listMinableReviews,
} from "@kittie/db";
import {
  keywordGap,
  localizationGap,
  marketPresence,
  mineNiche,
  type GapResult,
  type IndexRow,
  type MarketGapReport,
  type MinableReview,
  type NicheReport,
} from "@kittie/intelligence";

import { getDb } from "../lib/db.js";

/* ============================================================
   Intelligence services — niche review-mining and keyword-gap analysis.
   Thin orchestration over @kittie/db fetchers + the pure analyzers.
   ============================================================ */

const parseArr = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Mine a niche defined either by explicit App ids or a whole category. */
export async function mineNicheReviews(params: {
  appIds?: string[];
  category?: string;
  limit?: number;
}): Promise<NicheReport & { appIds: string[] }> {
  const db = getDb();
  let appIds = params.appIds ?? [];

  if (appIds.length === 0 && params.category) {
    appIds = await listAppIdsByCategory(db, params.category);
  }
  if (appIds.length === 0) return { totalReviews: 0, appCount: 0, clusters: [], appIds: [] };

  const rows = await listMinableReviews(db, appIds, params.limit ?? 20_000);
  const minable: MinableReview[] = rows.map((r) => ({
    id: r.id,
    appId: r.appId,
    rating: r.rating,
    sentiment: r.sentiment,
    topics: parseArr(r.topics),
    improvementAreas: parseArr(r.improvementAreas),
    reviewedAt: r.reviewedAt,
  }));

  return { ...mineNiche(minable), appIds };
}

async function loadIndexRows(filter: {
  appIds?: string[];
  store?: "apple" | "google";
  country?: string;
}): Promise<IndexRow[]> {
  const rows = await listKeywordIndexRows(getDb(), filter);
  return rows.map((r) => ({
    keywordId: r.keywordId,
    keyword: r.keyword,
    country: r.country,
    store: r.store,
    appId: r.appId,
    rank: r.rank,
    popularity: r.popularity,
    difficulty: r.difficulty,
  }));
}

/** Keywords competitors rank top-N for that the subject doesn't. */
export async function analyzeKeywordGap(params: {
  subjectAppId: string;
  competitorAppIds: string[];
  country?: string;
  store?: "apple" | "google";
}): Promise<GapResult> {
  const rows = await loadIndexRows({
    appIds: [params.subjectAppId, ...params.competitorAppIds],
    store: params.store,
    country: params.country,
  });
  return keywordGap(params.subjectAppId, params.competitorAppIds, rows);
}

/** Cross-market openings + per-app market presence. */
export async function analyzeLocalization(params: {
  appIds?: string[];
  store?: "apple" | "google";
}): Promise<{
  markets: MarketGapReport[];
  presence: Array<{ appId: string; byCountry: Record<string, number> }>;
}> {
  const rows = await loadIndexRows({ appIds: params.appIds, store: params.store });
  return {
    markets: localizationGap(rows),
    presence: params.appIds && params.appIds.length > 0 ? marketPresence(params.appIds, rows) : [],
  };
}

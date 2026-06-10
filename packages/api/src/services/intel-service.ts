import {
  listAppIdsByCategory,
  listKeywordIndexRows,
  listMinableReviews,
  staleKeywordsForScope,
} from "@kittie/db";
import { freshenKeyword } from "@kittie/ingest";
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

/** Freshness contract: live-rescore the scope's stalest Keywords (cadence 7d,
    politely capped) before answering, so gap views read today's rankings.
    Returns how many were freshened — surfaced in the response stamp. */
async function freshenScope(
  filter: { appIds?: string[]; store?: "apple" | "google" },
  cap = 20,
): Promise<number> {
  const db = getDb();
  const stale = await staleKeywordsForScope(db, filter, 7, cap);
  let freshened = 0;
  for (const k of stale) {
    try {
      await freshenKeyword(db, k.keyword, k.country, k.store);
      freshened++;
    } catch {
      /* one keyword failing must not block the answer */
    }
  }
  return freshened;
}

/** Keywords competitors rank top-N for that the subject doesn't. */
export async function analyzeKeywordGap(params: {
  subjectAppId: string;
  competitorAppIds: string[];
  country?: string;
  store?: "apple" | "google";
}): Promise<GapResult & { dataAsOf: string; freshened: number }> {
  const scope = {
    appIds: [params.subjectAppId, ...params.competitorAppIds],
    store: params.store,
  };
  const freshened = await freshenScope(scope);
  const rows = await loadIndexRows({ ...scope, country: params.country });
  return {
    ...keywordGap(params.subjectAppId, params.competitorAppIds, rows),
    dataAsOf: new Date().toISOString(),
    freshened,
  };
}

/** Cross-market openings + per-app market presence. */
export async function analyzeLocalization(params: {
  appIds?: string[];
  store?: "apple" | "google";
}): Promise<{
  markets: MarketGapReport[];
  presence: Array<{ appId: string; byCountry: Record<string, number> }>;
  dataAsOf: string;
  freshened: number;
}> {
  const freshened = await freshenScope({ appIds: params.appIds, store: params.store });
  const rows = await loadIndexRows({ appIds: params.appIds, store: params.store });
  return {
    markets: localizationGap(rows),
    presence: params.appIds && params.appIds.length > 0 ? marketPresence(params.appIds, rows) : [],
    dataAsOf: new Date().toISOString(),
    freshened,
  };
}

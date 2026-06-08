import { computeKeywordDifficulty } from "@kittie/intelligence";
import { findKeyword, keywordRowToDifficulty, upsertKeywordRow, type Db } from "@kittie/db";
import type { KeywordDifficulty, Store } from "@kittie/types";
import { searchAppleKeyword } from "../apple/search.js";
import { searchGoogleKeyword } from "../google/search.js";
import { searchPopularity } from "../keyword-popularity.js";
import { makeKeywordId } from "../util/ids.js";

const SEARCH_LIMIT = 10;

export async function fetchKeywordRankings(
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordDifficulty["topApps"]> {
  const countryCode = country.toLowerCase();
  const hits =
    store === "apple"
      ? await searchAppleKeyword(keyword, countryCode, SEARCH_LIMIT)
      : await searchGoogleKeyword(keyword, countryCode, SEARCH_LIMIT);

  return hits.map((hit) => ({
    title: hit.title,
    iconUrl: hit.iconUrl,
    reviewCount: hit.reviewCount,
    rating: hit.rating,
    rank: hit.rank,
  }));
}

/** Pull live store rankings, score difficulty, persist to keywords table. */
export async function syncKeyword(
  db: Db,
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordDifficulty> {
  const [topRankedApps, popularity] = await Promise.all([
    fetchKeywordRankings(keyword, country, store),
    searchPopularity(keyword, country, store).catch(() => null),
  ]);
  const scored = computeKeywordDifficulty({
    keyword,
    country: country.toUpperCase(),
    store,
    topRankedApps,
    searchPopularity: popularity,
  });

  const id = makeKeywordId(store, country, keyword);
  await upsertKeywordRow(db, {
    id,
    keyword: keyword.trim(),
    country: country.toUpperCase(),
    store,
    popularity: scored.popularity,
    difficulty: scored.difficulty,
    trafficScore: scored.trafficScore,
    competingAppCount: scored.competingAppCount,
    topResults: scored.topApps,
    computedAt: new Date(),
  });

  return scored;
}

export async function getCachedKeyword(
  db: Db,
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordDifficulty | null> {
  const row = await findKeyword(db, keyword, country, store);
  if (!row) return null;
  return keywordRowToDifficulty(row);
}

import { computeKeywordDifficulty } from "@kittie/intelligence";
import { findKeyword, keywordRowToDifficulty, upsertKeywordRow, type Db } from "@kittie/db";
import type { KeywordDifficulty, Store } from "@kittie/types";
import { searchAppleKeywordField, type StoreSearchResult } from "../apple/search.js";
import { countGoogleResults, searchGoogleKeyword } from "../google/search.js";
import { searchPopularity } from "../keyword-popularity.js";
import { makeKeywordId } from "../util/ids.js";
import { retryBusy } from "../util/retry-busy.js";

const SEARCH_LIMIT = 10;

interface KeywordField {
  topApps: KeywordDifficulty["topApps"];
  /** True competing-field depth (how many apps rank for the term), not just the top 10. */
  fieldDepth: number;
  /** Raw ranked store results, including store app ids for app-specific rank resolution. */
  results: StoreSearchResult[];
}

export async function fetchKeywordRankings(
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordField> {
  const countryCode = country.toLowerCase();

  // Apple gives the field depth free in one large fetch; Google needs a separate
  // un-enriched count call (its ranking fetch enriches each app, so it stays small).
  let hits: StoreSearchResult[];
  let results: StoreSearchResult[];
  let fieldDepth: number;
  if (store === "apple") {
    const field = await searchAppleKeywordField(keyword, countryCode, 200);
    results = field.results;
    hits = results.slice(0, SEARCH_LIMIT);
    fieldDepth = field.fieldDepth;
  } else {
    const [googleResults, count] = await Promise.all([
      searchGoogleKeyword(keyword, countryCode, SEARCH_LIMIT),
      countGoogleResults(keyword, countryCode).catch(() => 0),
    ]);
    results = googleResults;
    hits = results;
    fieldDepth = count || results.length;
  }

  return {
    topApps: hits.map((hit) => ({
      title: hit.title,
      iconUrl: hit.iconUrl,
      reviewCount: hit.reviewCount,
      rating: hit.rating,
      rank: hit.rank,
    })),
    fieldDepth,
    results,
  };
}

export interface SyncedKeywordRankings {
  difficulty: KeywordDifficulty;
  results: StoreSearchResult[];
}

/** Pull live store rankings, score difficulty, persist to keywords table. */
export async function syncKeywordWithRankings(
  db: Db,
  keyword: string,
  country: string,
  store: Store,
): Promise<SyncedKeywordRankings> {
  const [{ topApps: topRankedApps, fieldDepth, results }, popularity] = await Promise.all([
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
  // Difficulty is judged on the top 10, but the reported competing-app count is
  // the honest depth of the whole field (e.g. ~170 for "learn chinese", not 10).
  scored.competingAppCount = fieldDepth;

  const id = makeKeywordId(store, country, keyword);
  // Retry on SQLITE_BUSY: this write contends with the catalog drainers / snapshot
  // backfill / API on the shared local file, and libsql ignores busy_timeout.
  await retryBusy(() =>
    upsertKeywordRow(db, {
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
    }),
  );

  return { difficulty: scored, results };
}

/** Pull live store rankings, score difficulty, persist to keywords table. */
export async function syncKeyword(
  db: Db,
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordDifficulty> {
  const { difficulty } = await syncKeywordWithRankings(db, keyword, country, store);
  return difficulty;
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

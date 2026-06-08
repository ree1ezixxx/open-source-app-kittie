import {
  countAppsForSuggestions,
  findKeyword,
  keywordRowToDifficulty,
  listKeywordSuggestions,
  type KeywordSuggestion,
} from "@kittie/db";
import { suggestRelatedKeywords, syncKeyword } from "@kittie/ingest";
import type { KeywordDifficulty, Store } from "@kittie/types";

import { getDb } from "../lib/db.js";

/** Re-fetch store rankings after this window. */
const KEYWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isStale(computedAt: Date): boolean {
  return Date.now() - computedAt.getTime() > KEYWORD_TTL_MS;
}

export async function getKeywordDifficulty(
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordDifficulty> {
  const db = getDb();
  const row = await findKeyword(db, keyword, country, store);

  const cached = row ? keywordRowToDifficulty(row) : null;

  if (cached && row && !isStale(row.computedAt)) return cached;

  try {
    return await syncKeyword(db, keyword, country, store);
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

export async function getKeywordSuggestions(
  store?: Store,
  limit = 20,
): Promise<{ suggestions: KeywordSuggestion[]; appCount: number }> {
  const db = getDb();
  const [suggestions, appCount] = await Promise.all([
    listKeywordSuggestions(db, { store, limit: Math.min(limit, 50) }),
    countAppsForSuggestions(db, store),
  ]);
  return { suggestions, appCount };
}

export async function batchKeywordDifficulty(
  items: Array<{ keyword: string; country: string; store: Store }>,
): Promise<KeywordDifficulty[]> {
  const results: KeywordDifficulty[] = [];
  for (const item of items.slice(0, 25)) {
    results.push(await getKeywordDifficulty(item.keyword, item.country, item.store));
  }
  return results.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

/** Related keyword ideas for a seed (store search autocomplete; unscored). */
export async function getRelatedKeywords(
  keyword: string,
  country: string,
  store: Store,
  limit = 20,
): Promise<string[]> {
  return suggestRelatedKeywords(keyword, country, store, limit);
}

/** Markets we score a keyword across (cross-market opportunity finder). */
export const SUPPORTED_MARKETS = [
  "US", "GB", "CA", "AU", "IE", "NZ", "DE", "FR", "IT", "ES", "JP", "BR", "MX", "IN",
] as const;

export interface KeywordMarket {
  country: string;
  popularity: number;
  difficulty: number;
  competingAppCount: number;
  opportunityScore: number;
}

/** Run async `fn` over `items` with a concurrency cap (protects the upstream stores). */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The same keyword scored across every supported market — the cross-market
 * opportunity finder (surfaces countries where it's popular but uncontested).
 * Each market reuses the cached per-keyword difficulty (7-day TTL).
 */
export async function getKeywordMarkets(
  keyword: string,
  store: Store,
  countries: readonly string[] = SUPPORTED_MARKETS,
): Promise<KeywordMarket[]> {
  const results = await mapPool(countries.slice(0, 16), 4, async (country) => {
    try {
      const kd = await getKeywordDifficulty(keyword, country, store);
      return {
        country: country.toUpperCase(),
        popularity: kd.popularity,
        difficulty: kd.difficulty,
        competingAppCount: kd.competingAppCount,
        opportunityScore: kd.opportunityScore,
      } satisfies KeywordMarket;
    } catch {
      return null;
    }
  });
  return results.filter((r): r is KeywordMarket => r != null);
}

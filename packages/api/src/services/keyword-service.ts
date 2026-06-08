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

import { findKeyword, keywordRowToDifficulty } from "@kittie/db";
import { syncKeyword } from "@kittie/ingest";
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

  if (row) {
    const cached = keywordRowToDifficulty(row);
    if (cached && !isStale(row.computedAt)) return cached;
  }

  return syncKeyword(db, keyword, country, store);
}

export async function batchKeywordDifficulty(
  items: Array<{ keyword: string; country: string; store: Store }>,
): Promise<KeywordDifficulty[]> {
  const results: KeywordDifficulty[] = [];
  for (const item of items.slice(0, 10)) {
    results.push(await getKeywordDifficulty(item.keyword, item.country, item.store));
  }
  return results;
}

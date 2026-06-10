import { apps, keywordRankings, type Db } from "@kittie/db";
import type { Store } from "@kittie/types";
import { eq, inArray } from "drizzle-orm";

import { searchAppleKeyword } from "../apple/search.js";
import { searchGoogleKeyword } from "../google/search.js";
import { syncKeyword } from "./keywords.js";
import { makeAppId, makeKeywordId } from "../util/ids.js";

const TOP_RANKS = 10;

/**
 * Explode a Keyword's live top-10 into the keyword_rankings inverse index.
 * Only Apps already in the catalog get rows — one batched existence query,
 * never a fabricated App row. Replace-then-insert keeps one observation set
 * per Keyword. Canonical implementation shared by the corpus sweep and the
 * Freshness-contract re-scores (gap / localization queries).
 */
export async function writeInverseIndex(
  db: Db,
  item: { keyword: string; country: string },
  store: Store,
): Promise<number> {
  const results =
    store === "apple"
      ? await searchAppleKeyword(item.keyword, item.country, TOP_RANKS)
      : await searchGoogleKeyword(item.keyword, item.country, TOP_RANKS);

  const keywordId = makeKeywordId(store, item.country, item.keyword);
  const candidateIds = results.map((r) => makeAppId(store, r.storeAppId));

  const existing = candidateIds.length
    ? await db.select({ id: apps.id }).from(apps).where(inArray(apps.id, candidateIds))
    : [];
  const known = new Set(existing.map((r) => r.id));

  const observedAt = new Date();
  const rows = results
    .map((r) => ({ appId: makeAppId(store, r.storeAppId), rank: r.rank }))
    .filter((r) => known.has(r.appId))
    .map((r) => ({
      id: `${keywordId}:${r.appId}`,
      keywordId,
      appId: r.appId,
      rank: r.rank,
      observedAt,
    }));

  await db.delete(keywordRankings).where(eq(keywordRankings.keywordId, keywordId));
  if (rows.length > 0) await db.insert(keywordRankings).values(rows);
  return rows.length;
}

/**
 * Freshness-contract re-score: live-rescore one Keyword (difficulty, traffic,
 * popularity) AND refresh its inverse-index observation in a single pass.
 */
export async function freshenKeyword(
  db: Db,
  keyword: string,
  country: string,
  store: Store,
): Promise<{ ranked: number }> {
  await syncKeyword(db, keyword, country, store);
  const ranked = await writeInverseIndex(db, { keyword, country }, store);
  return { ranked };
}

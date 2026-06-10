import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "../client.js";
import { appSnapshots, apps, keywordRankings, keywords, reviews } from "../schema.js";

/* ============================================================
   Additive lane — fetchers for the intelligence services
   (niche mining, keyword gap, compare). Raw drizzle stays here;
   the API consumes typed rows.
   ============================================================ */

export interface MinableReviewRow {
  id: string;
  appId: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null;
  topics: string | null;
  improvementAreas: string | null;
  reviewedAt: Date;
}

/** Tagged reviews for a set of Apps, newest first. */
export async function listMinableReviews(
  db: Db,
  appIds: string[],
  limit = 20_000,
): Promise<MinableReviewRow[]> {
  if (appIds.length === 0) return [];
  return db
    .select({
      id: reviews.id,
      appId: reviews.appId,
      rating: reviews.rating,
      sentiment: reviews.sentiment,
      topics: reviews.topics,
      improvementAreas: reviews.improvementAreas,
      reviewedAt: reviews.reviewedAt,
    })
    .from(reviews)
    .where(inArray(reviews.appId, appIds))
    .orderBy(desc(reviews.reviewedAt))
    .limit(limit);
}

export async function listAppIdsByCategory(db: Db, category: string): Promise<string[]> {
  const rows = await db.select({ id: apps.id }).from(apps).where(eq(apps.category, category));
  return rows.map((r) => r.id);
}

export interface KeywordIndexRowRaw {
  keywordId: string;
  appId: string;
  rank: number;
  keyword: string;
  country: string;
  store: "apple" | "google";
  popularity: number | null;
  difficulty: number | null;
}

/** The inverse index (keyword_rankings ⋈ keywords), optionally filtered. */
export async function listKeywordIndexRows(
  db: Db,
  filter: { appIds?: string[]; store?: "apple" | "google"; country?: string } = {},
): Promise<KeywordIndexRowRaw[]> {
  const conds = [];
  if (filter.appIds && filter.appIds.length > 0)
    conds.push(inArray(keywordRankings.appId, filter.appIds));
  if (filter.store) conds.push(eq(keywords.store, filter.store));
  if (filter.country) conds.push(eq(keywords.country, filter.country.toUpperCase()));

  return db
    .select({
      keywordId: keywordRankings.keywordId,
      appId: keywordRankings.appId,
      rank: keywordRankings.rank,
      keyword: keywords.keyword,
      country: keywords.country,
      store: keywords.store,
      popularity: keywords.popularity,
      difficulty: keywords.difficulty,
    })
    .from(keywordRankings)
    .innerJoin(keywords, eq(keywordRankings.keywordId, keywords.id))
    .where(conds.length > 0 ? and(...conds) : undefined);
}

/** App rows by id (compare columns). */
export async function listAppsByIds(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(apps).where(inArray(apps.id, ids));
}

/** One App's full Snapshot series, oldest first (overlaid history charts). */
export async function listSnapshotSeries(db: Db, appId: string) {
  return db
    .select()
    .from(appSnapshots)
    .where(eq(appSnapshots.appId, appId))
    .orderBy(asc(appSnapshots.snapshotDate));
}

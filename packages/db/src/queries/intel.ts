import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

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

/** Latest review-ingest time per App (epoch seconds; absent = never synced).
    Powers the Freshness contract: a surface freshens any scope App whose
    last ingest is older than its cadence before answering. */
export async function reviewFreshnessByApp(
  db: Db,
  appIds: string[],
): Promise<Map<string, number>> {
  if (appIds.length === 0) return new Map();
  const rows = await db
    .select({
      appId: reviews.appId,
      lastIngest: sql<number>`max(${reviews.ingestedAt})`,
    })
    .from(reviews)
    .where(inArray(reviews.appId, appIds))
    .groupBy(reviews.appId);
  return new Map(rows.map((r) => [r.appId, r.lastIngest]));
}

/** Keywords in an index scope whose scores are staler than the cadence —
    the Freshness contract's re-score list for gap/localization queries. */
export async function staleKeywordsForScope(
  db: Db,
  filter: { appIds?: string[]; store?: "apple" | "google" },
  cadenceDays: number,
  cap: number,
): Promise<Array<{ keywordId: string; keyword: string; country: string; store: "apple" | "google" }>> {
  const conds = [];
  if (filter.appIds && filter.appIds.length > 0)
    conds.push(inArray(keywordRankings.appId, filter.appIds));
  if (filter.store) conds.push(eq(keywords.store, filter.store));
  const cutoff = new Date(Date.now() - cadenceDays * 24 * 3600_000);
  conds.push(sql`${keywords.computedAt} < ${Math.floor(cutoff.getTime() / 1000)}`);

  const rows = await db
    .selectDistinct({
      keywordId: keywords.id,
      keyword: keywords.keyword,
      country: keywords.country,
      store: keywords.store,
    })
    .from(keywordRankings)
    .innerJoin(keywords, eq(keywordRankings.keywordId, keywords.id))
    .where(and(...conds))
    .orderBy(asc(keywords.computedAt))
    .limit(cap);
  return rows.map((r) => ({ ...r, store: r.store as "apple" | "google" }));
}

/** Titles for a set of Apps — progress labels in sync streams. */
export async function appTitlesByIds(db: Db, appIds: string[]): Promise<Map<string, string>> {
  if (appIds.length === 0) return new Map();
  const rows = await db
    .select({ id: apps.id, title: apps.title })
    .from(apps)
    .where(inArray(apps.id, appIds));
  return new Map(rows.map((r) => [r.id, r.title]));
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

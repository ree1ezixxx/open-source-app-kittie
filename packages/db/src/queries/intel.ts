import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  computeGrowthScore,
  estimateDownloads,
  estimateRevenue,
  signalsFromContext,
} from "@kittie/intelligence";

import type { Db } from "../client.js";
import { appSnapshots, apps, keywordRankings, keywords, reviews } from "../schema.js";
import { listSnapshotContexts } from "./signals.js";

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

/* ============================================================
   Autonomous idea generator — source-app selection + review
   evidence. Clones AppKittie's "$50k/mo, sort rating low→high,
   read the reviews" playbook against our live snapshots.
   ============================================================ */

export interface IdeaCandidateApp {
  id: string;
  title: string;
  category: string | null;
  releasedAt: number | null;
  price: number | null;
  rating: number | null;
  reviewCount: number;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
  growthScore: number | null;
}

function epochSeconds(date: Date | null): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

/** Proven-demand-but-flawed apps from the latest snapshot per App: rising
    (growthScore > 50), real review volume, and a low-ish rating (the unmet
    need), ranked by revenue then growth. This is the live, self-updating
    sourcing list — next week's risers replace today's. */
export async function listIdeaCandidateApps(
  db: Db,
  opts: { ratingCeiling?: number; minReviews?: number; limit?: number } = {},
): Promise<IdeaCandidateApp[]> {
  const ceiling = opts.ratingCeiling ?? 4.0;
  const minReviews = opts.minReviews ?? 200;
  const limit = Math.min(opts.limit ?? 40, 500);
  const contexts = await listSnapshotContexts(db, "7d");

  return contexts
    .map((ctx) => {
      const signals = signalsFromContext(ctx);
      const revenueEstimate = estimateRevenue(signals);
      const downloadsEstimate = estimateDownloads(signals, revenueEstimate);
      const growthScore = computeGrowthScore(signals, "7d");
      return {
        id: ctx.app.id,
        title: ctx.app.title,
        category: ctx.app.category,
        releasedAt: epochSeconds(ctx.app.releasedAt),
        price: ctx.app.price,
        rating: ctx.latest.rating,
        reviewCount: ctx.latest.reviewCount,
        downloadsEstimate,
        revenueEstimate,
        growthScore,
      } satisfies IdeaCandidateApp;
    })
    .filter(
      (app) =>
        app.rating !== null &&
        app.rating <= ceiling &&
        app.reviewCount >= minReviews &&
        app.growthScore !== null &&
        app.growthScore > 50 &&
        app.revenueEstimate !== null,
    )
    .sort(
      (a, b) =>
        (b.revenueEstimate ?? 0) - (a.revenueEstimate ?? 0) ||
        (b.growthScore ?? 0) - (a.growthScore ?? 0),
    )
    .slice(0, limit);
}

export interface ReviewEvidence {
  id: string;
  title: string | null;
  body: string | null;
  rating: number;
}

/** Verbatim text for a set of review ids — the complaint snippets the
    generator hands the model so concepts are grounded in real words,
    never invented. */
export async function reviewTextByIds(db: Db, ids: string[]): Promise<ReviewEvidence[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: reviews.id,
      title: reviews.title,
      body: reviews.body,
      rating: reviews.rating,
    })
    .from(reviews)
    .where(inArray(reviews.id, ids));
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? null,
    body: r.body ?? null,
    rating: r.rating,
  }));
}

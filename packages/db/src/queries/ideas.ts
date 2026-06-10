import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { appIdeas, apps, reviews, type App, type AppIdea } from "../schema.js";

/* ============================================================
   Hot ideas storage (ADR 0005). Generation happens in the API's
   hot-ideas sweep; these queries only read/write the stored rows.
   ============================================================ */

export type IdeaSort =
  | "created"
  | "released"
  | "reviews"
  | "downloads"
  | "revenue"
  | "rating"
  | "price";

export interface IdeaListQuery {
  search?: string;
  sourceCategory?: string;
  ideaCategory?: string;
  needsBackend?: boolean;
  needsDatabase?: boolean;
  needsAi?: boolean;
  sort?: IdeaSort;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const SORT_COLUMNS = {
  created: appIdeas.createdAt,
  released: appIdeas.releasedAt,
  reviews: appIdeas.reviewCount,
  downloads: appIdeas.downloadsEstimate,
  revenue: appIdeas.revenueEstimate,
  rating: appIdeas.rating,
  price: appIdeas.price,
} as const;

export type ListedIdea = AppIdea & { storeAppId: string; store: string };

export async function listIdeas(
  db: Db,
  q: IdeaListQuery = {},
): Promise<{ ideas: ListedIdea[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, q.pageSize ?? 12));

  const where = and(
    q.search
      ? or(
          like(appIdeas.title, `%${q.search}%`),
          like(appIdeas.summary, `%${q.search}%`),
        )
      : undefined,
    q.sourceCategory ? eq(appIdeas.sourceCategory, q.sourceCategory) : undefined,
    q.ideaCategory ? like(appIdeas.ideaCategory, `%${q.ideaCategory}%`) : undefined,
    // Blueprint toggles are AND-required, matching the live filter semantics.
    q.needsBackend ? eq(appIdeas.needsBackend, true) : undefined,
    q.needsDatabase ? eq(appIdeas.needsDatabase, true) : undefined,
    q.needsAi ? eq(appIdeas.needsAi, true) : undefined,
  );

  const sortCol = SORT_COLUMNS[q.sort ?? "created"];
  const orderBy = q.order === "asc" ? asc(sortCol) : desc(sortCol);

  const [rows, totals] = await Promise.all([
    db
      .select({ idea: appIdeas, storeAppId: apps.storeAppId, store: apps.store })
      .from(appIdeas)
      .innerJoin(apps, eq(appIdeas.sourceAppId, apps.id))
      .where(where)
      .orderBy(orderBy, desc(appIdeas.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(appIdeas)
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;

  return {
    ideas: rows.map((r) => ({ ...r.idea, storeAppId: r.storeAppId, store: r.store })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Distinct filter facets for the Hot ideas page. */
export async function listIdeaFacets(
  db: Db,
): Promise<{ sourceCategories: string[]; ideaCategories: string[] }> {
  const [src, idea] = await Promise.all([
    db.selectDistinct({ v: appIdeas.sourceCategory }).from(appIdeas),
    db.selectDistinct({ v: appIdeas.ideaCategory }).from(appIdeas),
  ]);
  return {
    sourceCategories: src.map((r) => r.v).sort(),
    ideaCategories: idea.map((r) => r.v).sort(),
  };
}

/** Detail lookup by the source App's store id (the stable part of the URL). */
export async function getIdeaByStoreAppId(
  db: Db,
  storeAppId: string,
): Promise<{ idea: AppIdea; sourceApp: App } | null> {
  const [row] = await db
    .select({ idea: appIdeas, sourceApp: apps })
    .from(appIdeas)
    .innerJoin(apps, eq(appIdeas.sourceAppId, apps.id))
    .where(eq(apps.storeAppId, storeAppId))
    .limit(1);
  return row ?? null;
}

/** Sibling ideas from the same source category, for the detail page rail. */
export async function listSimilarIdeas(
  db: Db,
  sourceCategory: string,
  excludeId: string,
  limit = 4,
): Promise<AppIdea[]> {
  return db
    .select()
    .from(appIdeas)
    .where(and(eq(appIdeas.sourceCategory, sourceCategory), sql`${appIdeas.id} != ${excludeId}`))
    .orderBy(desc(appIdeas.reviewCount))
    .limit(limit);
}

/** How many distinct Snapshot days exist — drives the gate's growth trust. */
export async function countSnapshotDays(db: Db): Promise<number> {
  const rows = await db.all<{ days: number }>(
    sql`SELECT COUNT(DISTINCT snapshot_date) AS days FROM app_snapshots`,
  );
  return rows[0]?.days ?? 0;
}

export async function countIdeas(db: Db): Promise<number> {
  const [{ total }] = (await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(appIdeas)) as [{ total: number }];
  return total;
}

export interface IdeaCandidate {
  appId: string;
  storeAppId: string;
  store: string;
  title: string;
  category: string | null;
  description: string | null;
  price: number | null;
  releasedAt: Date | null;
  reviewCount: number;
  rating: number | null;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
  growthScore: number | null;
  chartRank: number | null;
}

/**
 * The candidate pool for the selection gate: every App with a latest Snapshot
 * and a sane review floor that does NOT yet have an idea. Scoring happens in
 * the API's pure gate function, not in SQL.
 */
export async function listIdeaCandidates(db: Db, minReviews = 50): Promise<IdeaCandidate[]> {
  const rows = await db.all<{
    appId: string;
    storeAppId: string;
    store: string;
    title: string;
    category: string | null;
    description: string | null;
    price: number | null;
    releasedAt: number | null;
    reviewCount: number | null;
    rating: number | null;
    downloadsEstimate: number | null;
    revenueEstimate: number | null;
    growthScore: number | null;
    chartRank: number | null;
  }>(sql`
    SELECT
      a.id            AS appId,
      a.store_app_id  AS storeAppId,
      a.store         AS store,
      a.title         AS title,
      a.category      AS category,
      a.description   AS description,
      a.price         AS price,
      a.released_at   AS releasedAt,
      s.review_count  AS reviewCount,
      s.rating        AS rating,
      s.downloads_estimate AS downloadsEstimate,
      s.revenue_estimate   AS revenueEstimate,
      s.growth_score  AS growthScore,
      s.chart_rank    AS chartRank
    FROM apps a
    JOIN app_snapshots s ON s.app_id = a.id
      AND s.snapshot_date = (
        SELECT MAX(s2.snapshot_date) FROM app_snapshots s2 WHERE s2.app_id = a.id
      )
    LEFT JOIN app_ideas i ON i.source_app_id = a.id
    WHERE i.id IS NULL
      AND s.review_count >= ${minReviews}
      AND a.title IS NOT NULL
  `);

  return rows.map((r) => ({
    ...r,
    reviewCount: r.reviewCount ?? 0,
    releasedAt: r.releasedAt ? new Date(r.releasedAt * 1000) : null,
  }));
}

/**
 * Low-rating review snippets for one App — the sharpest signal of what the
 * incumbent fumbles; feeds the idea-generation prompt.
 */
export async function listComplaintSnippets(
  db: Db,
  appId: string,
  limit = 3,
): Promise<string[]> {
  const rows = await db
    .select({ title: reviews.title, body: reviews.body })
    .from(reviews)
    .where(and(eq(reviews.appId, appId), lte(reviews.rating, 3)))
    .orderBy(asc(sql`LENGTH(${reviews.body})`))
    .limit(limit);
  return rows
    .map((r) => (r.title || r.body || "").slice(0, 120))
    .filter((s) => s.length > 0);
}

export async function insertIdea(
  db: Db,
  idea: Omit<AppIdea, "id" | "createdAt">,
): Promise<AppIdea> {
  const row: AppIdea = { id: randomUUID(), createdAt: new Date(), ...idea };
  await db.insert(appIdeas).values(row).onConflictDoNothing();
  return row;
}

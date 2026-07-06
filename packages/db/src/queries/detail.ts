import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  appleSearchAds,
  apps,
  creators,
  iaps,
  metaAds,
  reviews,
} from "../schema.js";
import { parseJsonArray } from "./signals.js";

export async function getAppById(db: Db, id: string) {
  const [app] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
  return app ?? null;
}

export async function getAppIdByStoreAppId(db: Db, store: "apple" | "google", storeAppId: string): Promise<string | null> {
  const [app] = await db
    .select({ id: apps.id })
    .from(apps)
    .where(sql`${apps.store} = ${store} and ${apps.storeAppId} = ${storeAppId}`)
    .limit(1);
  return app?.id ?? null;
}

/**
 * Hydrate a known set of apps by id — chunked so the SQLite variable limit is
 * never hit. The bounded counterpart to a full-catalog scan: callers that
 * already hold the ids they need (ads join, similar-apps, favourites) load only
 * those rows instead of pulling ~1.1M into memory.
 */
export async function listAppsByIds(
  db: Db,
  ids: string[],
): Promise<(typeof apps.$inferSelect)[]> {
  if (ids.length === 0) return [];
  const out: (typeof apps.$inferSelect)[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    out.push(...(await db.select().from(apps).where(inArray(apps.id, ids.slice(i, i + 500)))));
  }
  return out;
}

/** Source-app in-app purchases (name + price tier) for the Hot Ideas detail. */
export async function listAppIaps(db: Db, appId: string) {
  return db
    .select({ name: iaps.name, price: iaps.price, currency: iaps.currency })
    .from(iaps)
    .where(eq(iaps.appId, appId));
}

/** Persist lazily-fetched listing facts (size, min OS, seller). */
export async function updateAppListingFacts(
  db: Db,
  id: string,
  facts: { fileSizeBytes: number | null; minOsVersion: string | null; sellerName: string | null },
): Promise<void> {
  await db.update(apps).set(facts).where(eq(apps.id, id));
}

/**
 * Recent review tags (topics + improvement-areas) for a BOUNDED set of apps,
 * newest-first, capped at `perApp` reviews per app. Powers the similar-apps
 * "review-topic overlap" pass: two apps whose users complain about the same
 * things are adjacent/analogue candidates. Selects only the tag columns (never
 * bodies), so it stays light even for high-review apps. Returns the DISTINCT tag
 * set seen across each app's latest `perApp` reviews; apps with no reviews are
 * absent from the map.
 */
export async function getRecentReviewTagsForApps(
  db: Db,
  ids: string[],
  perApp = 50,
): Promise<Map<string, { topics: string[]; improvementAreas: string[] }>> {
  const out = new Map<string, { topics: string[]; improvementAreas: string[] }>();
  if (ids.length === 0) return out;
  const seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db
      .select({
        appId: reviews.appId,
        topics: reviews.topics,
        improvementAreas: reviews.improvementAreas,
      })
      .from(reviews)
      .where(inArray(reviews.appId, ids.slice(i, i + 500)))
      .orderBy(desc(reviews.reviewedAt));
    for (const r of rows) {
      const n = seen.get(r.appId) ?? 0;
      if (n >= perApp) continue;
      seen.set(r.appId, n + 1);
      let agg = out.get(r.appId);
      if (!agg) {
        agg = { topics: [], improvementAreas: [] };
        out.set(r.appId, agg);
      }
      for (const t of parseJsonArray(r.topics)) {
        if (!agg.topics.includes(t)) agg.topics.push(t);
      }
      for (const a of parseJsonArray(r.improvementAreas)) {
        if (!agg.improvementAreas.includes(a)) agg.improvementAreas.push(a);
      }
    }
  }
  return out;
}

/** One review row for cross-app clustering — body + rating + date + persisted tags. */
export interface ClusterReviewRow {
  appId: string;
  rating: number;
  title: string | null;
  body: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null;
  topics: string[];
  improvementAreas: string[];
  /** ISO-8601 review date; null when the source row had none. */
  reviewedAt: string | null;
}

/**
 * Recent reviews (body + rating + date + persisted tags) for a BOUNDED set of
 * apps, newest-first, capped at `perApp` reviews per app. The evidence-bearing
 * counterpart to {@link getRecentReviewTagsForApps} (which returns only distinct
 * tag sets): `cluster_reviews` (#259) needs the bodies for quotes, the ratings +
 * dates for per-app sentiment and trend, and the tags for the deterministic
 * theme base. Apps with no reviews are simply absent from the result. Selects
 * only the columns clustering needs — never the reviewer `author` (PII).
 */
export async function getRecentReviewsForApps(
  db: Db,
  ids: string[],
  perApp = 100,
): Promise<ClusterReviewRow[]> {
  const out: ClusterReviewRow[] = [];
  if (ids.length === 0) return out;
  const seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db
      .select({
        appId: reviews.appId,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        sentiment: reviews.sentiment,
        topics: reviews.topics,
        improvementAreas: reviews.improvementAreas,
        reviewedAt: reviews.reviewedAt,
      })
      .from(reviews)
      .where(inArray(reviews.appId, ids.slice(i, i + 500)))
      .orderBy(desc(reviews.reviewedAt));
    for (const r of rows) {
      const n = seen.get(r.appId) ?? 0;
      if (n >= perApp) continue;
      seen.set(r.appId, n + 1);
      out.push({
        appId: r.appId,
        rating: r.rating,
        title: r.title,
        body: r.body,
        sentiment: r.sentiment ?? null,
        topics: parseJsonArray(r.topics),
        improvementAreas: parseJsonArray(r.improvementAreas),
        reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
      });
    }
  }
  return out;
}

export async function loadAppRelations(db: Db, appId: string) {
  const [iapRows, metaRows, creatorRows, adRows, reviewRows] = await Promise.all([
    db.select().from(iaps).where(eq(iaps.appId, appId)),
    db.select().from(metaAds).where(eq(metaAds.appId, appId)),
    db.select().from(creators).where(eq(creators.appId, appId)),
    db.select().from(appleSearchAds).where(eq(appleSearchAds.appId, appId)),
    // Newest-first so "latest N" slicing in the route is truly the latest,
    // even after delta syncs append fresh reviews.
    db.select().from(reviews).where(eq(reviews.appId, appId)).orderBy(desc(reviews.reviewedAt)),
  ]);

  return { iapRows, metaRows, creatorRows, adRows, reviewRows };
}

/**
 * The fresh set: every App with ≥1 indexed Review, paired with the latest
 * review ingest time (epoch seconds). Oldest-first so the continuous sweep can
 * top up the stalest apps first. Membership follows ingestion, not monitoring.
 */
export async function listFreshSet(
  db: Db,
): Promise<Array<{ appId: string; lastIngest: number }>> {
  return db
    .select({
      appId: reviews.appId,
      lastIngest: sql<number>`max(${reviews.ingestedAt})`,
    })
    .from(reviews)
    .groupBy(reviews.appId)
    .orderBy(sql`max(${reviews.ingestedAt}) asc`);
}

/**
 * Count of *indexed* reviews per app (what we actually hold), keyed by app id.
 * Used by the monitoring rail so it shows real coverage, not the store's
 * inflated listing total.
 */
export async function reviewCountsByApp(
  db: Db,
  ids: string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ appId: reviews.appId, n: sql<number>`count(*)` })
    .from(reviews)
    .where(inArray(reviews.appId, ids))
    .groupBy(reviews.appId);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.appId] = Number(r.n);
  return out;
}

export async function appsWithAppleAds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ appId: appleSearchAds.appId }).from(appleSearchAds);
  return new Set(rows.map((r) => r.appId));
}

export async function appsWithAppleAdsForIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ appId: appleSearchAds.appId })
    .from(appleSearchAds)
    .where(inArray(appleSearchAds.appId, ids));
  return new Set(rows.map((r) => r.appId));
}

export async function appsWithCreators(db: Db): Promise<Set<string>> {
  const rows = await db.select({ appId: creators.appId }).from(creators);
  return new Set(rows.map((r) => r.appId));
}

export async function appsWithCreatorsForIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ appId: creators.appId })
    .from(creators)
    .where(inArray(creators.appId, ids));
  return new Set(rows.map((r) => r.appId));
}

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

export async function getAppById(db: Db, id: string) {
  const [app] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
  return app ?? null;
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

export async function appsWithCreators(db: Db): Promise<Set<string>> {
  const rows = await db.select({ appId: creators.appId }).from(creators);
  return new Set(rows.map((r) => r.appId));
}

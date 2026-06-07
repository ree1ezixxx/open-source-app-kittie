import { eq } from "drizzle-orm";
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

export async function loadAppRelations(db: Db, appId: string) {
  const [iapRows, metaRows, creatorRows, adRows, reviewRows] = await Promise.all([
    db.select().from(iaps).where(eq(iaps.appId, appId)),
    db.select().from(metaAds).where(eq(metaAds.appId, appId)),
    db.select().from(creators).where(eq(creators.appId, appId)),
    db.select().from(appleSearchAds).where(eq(appleSearchAds.appId, appId)),
    db.select().from(reviews).where(eq(reviews.appId, appId)),
  ]);

  return { iapRows, metaRows, creatorRows, adRows, reviewRows };
}

export async function appsWithAppleAds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ appId: appleSearchAds.appId }).from(appleSearchAds);
  return new Set(rows.map((r) => r.appId));
}

export async function appsWithCreators(db: Db): Promise<Set<string>> {
  const rows = await db.select({ appId: creators.appId }).from(creators);
  return new Set(rows.map((r) => r.appId));
}

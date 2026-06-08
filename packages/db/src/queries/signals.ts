import { count, eq } from "drizzle-orm";
import type { GrowthPeriod } from "@kittie/types";
import type { Db } from "../client.js";
import {
  apps,
  appSnapshots,
  iaps,
  metaAds,
  type App,
  type AppSnapshot,
} from "../schema.js";

const GROWTH_PERIOD_DAYS: Record<GrowthPeriod, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

export interface SnapshotContext {
  app: App;
  latest: AppSnapshot;
  prior: AppSnapshot | null;
  iapCount: number;
  metaAdCount: number;
  metaAdCountPrior: number | null;
  categoryAppCount: number;
}

export function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function findPriorSnapshot(
  db: Db,
  appId: string,
  currentDate: string,
  period: GrowthPeriod,
): Promise<AppSnapshot | null> {
  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;
  const targetDate = daysBefore(currentDate, periodDays);
  const rows = await db
    .select()
    .from(appSnapshots)
    .where(eq(appSnapshots.appId, appId))
    .orderBy(appSnapshots.snapshotDate);

  let best: AppSnapshot | null = null;
  for (const row of rows) {
    if (row.snapshotDate <= targetDate) best = row;
    if (row.snapshotDate > targetDate) break;
  }
  return best;
}

export async function countApps(db: Db): Promise<number> {
  const [row] = await db.select({ value: count() }).from(apps);
  return row?.value ?? 0;
}

export async function countAppsInCategory(
  db: Db,
  category: string | null,
): Promise<number> {
  if (!category) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(apps)
    .where(eq(apps.category, category));
  return row?.value ?? 0;
}

export async function getLatestSnapshot(
  db: Db,
  appId: string,
): Promise<AppSnapshot | null> {
  const rows = await db
    .select()
    .from(appSnapshots)
    .where(eq(appSnapshots.appId, appId))
    .orderBy(appSnapshots.snapshotDate);

  return rows.at(-1) ?? null;
}

export async function getSnapshotContext(
  db: Db,
  appId: string,
  period: GrowthPeriod = "7d",
): Promise<SnapshotContext | null> {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) return null;

  const latest = await getLatestSnapshot(db, appId);
  if (!latest) return null;

  const prior = await findPriorSnapshot(db, appId, latest.snapshotDate, period);

  const [iapRow] = await db
    .select({ value: count() })
    .from(iaps)
    .where(eq(iaps.appId, appId));

  const metaRows = await db.select().from(metaAds).where(eq(metaAds.appId, appId));

  let metaAdCountPrior: number | null = null;
  if (prior) {
    metaAdCountPrior = metaRows.filter(
      (ad) => ad.firstSeenAt && ad.firstSeenAt <= prior.createdAt,
    ).length;
  }

  return {
    app,
    latest,
    prior,
    iapCount: iapRow?.value ?? 0,
    metaAdCount: metaRows.length,
    metaAdCountPrior,
    categoryAppCount: await countAppsInCategory(db, app.category),
  };
}

export async function listSnapshotContexts(
  db: Db,
  period: GrowthPeriod = "7d",
): Promise<SnapshotContext[]> {
  // Bulk-load everything in a handful of queries, then assemble in memory.
  // The per-app version (getSnapshotContext) fires ~6 queries each — at 100K
  // apps that's ~600K queries and a ~30s cold build. This is the same data in 4.
  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;
  const [allApps, allSnapshots, allIaps, allMetaAds] = await Promise.all([
    db.select().from(apps),
    db.select().from(appSnapshots).orderBy(appSnapshots.appId, appSnapshots.snapshotDate),
    db.select({ appId: iaps.appId }).from(iaps),
    db.select().from(metaAds),
  ]);

  // Group by appId (snapshots arrive pre-sorted by date).
  const snapshotsByApp = new Map<string, AppSnapshot[]>();
  for (const snap of allSnapshots) {
    const list = snapshotsByApp.get(snap.appId);
    if (list) list.push(snap);
    else snapshotsByApp.set(snap.appId, [snap]);
  }

  const iapCountByApp = new Map<string, number>();
  for (const { appId } of allIaps) iapCountByApp.set(appId, (iapCountByApp.get(appId) ?? 0) + 1);

  const metaAdsByApp = new Map<string, typeof allMetaAds>();
  for (const ad of allMetaAds) {
    const list = metaAdsByApp.get(ad.appId);
    if (list) list.push(ad);
    else metaAdsByApp.set(ad.appId, [ad]);
  }

  // Category counts are derivable from the apps list — no per-app COUNT query.
  const categoryCount = new Map<string, number>();
  for (const app of allApps) {
    if (app.category) categoryCount.set(app.category, (categoryCount.get(app.category) ?? 0) + 1);
  }

  const contexts: SnapshotContext[] = [];
  for (const app of allApps) {
    const snaps = snapshotsByApp.get(app.id);
    const latest = snaps?.at(-1);
    if (!latest) continue; // mirrors getSnapshotContext: no snapshot → skip

    // Prior = last snapshot on/before (latest.date - periodDays). snaps is date-sorted.
    const targetDate = daysBefore(latest.snapshotDate, periodDays);
    let prior: AppSnapshot | null = null;
    for (const snap of snaps!) {
      if (snap.snapshotDate <= targetDate) prior = snap;
      else break;
    }

    const metaRows = metaAdsByApp.get(app.id) ?? [];
    const metaAdCountPrior = prior
      ? metaRows.filter((ad) => ad.firstSeenAt && ad.firstSeenAt <= prior.createdAt).length
      : null;

    contexts.push({
      app,
      latest,
      prior,
      iapCount: iapCountByApp.get(app.id) ?? 0,
      metaAdCount: metaRows.length,
      metaAdCountPrior,
      categoryAppCount: app.category ? (categoryCount.get(app.category) ?? 0) : 0,
    });
  }

  return contexts;
}

export async function listHistoricals(db: Db, appId: string): Promise<AppSnapshot[]> {
  return db
    .select()
    .from(appSnapshots)
    .where(eq(appSnapshots.appId, appId))
    .orderBy(appSnapshots.snapshotDate);
}

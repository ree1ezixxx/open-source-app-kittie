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
  const allApps = await db.select().from(apps);
  const contexts: SnapshotContext[] = [];

  for (const app of allApps) {
    const ctx = await getSnapshotContext(db, app.id, period);
    if (ctx) contexts.push(ctx);
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

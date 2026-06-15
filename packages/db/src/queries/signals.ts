import { count, eq } from "drizzle-orm";
import type { GrowthPeriod, GrowthWindow } from "@kittie/types";
import type { Db } from "../client.js";
import {
  apps,
  appSnapshots,
  iaps,
  metaAds,
  type App,
  type AppSnapshot,
} from "../schema.js";
import {
  computeGrowthWindow,
  GROWTH_PERIOD_DAYS,
  type SeriesPoint,
} from "./growth.js";

/** Numeric snapshot fields a growth window can be computed over. */
export type GrowthMetric = "reviewCount" | "chartRank";

export interface SnapshotContext {
  app: App;
  latest: AppSnapshot;
  /**
   * @deprecated Endpoint snapshot N days back — a two-point delta basis that
   * ADR-0001 supersedes. Prefer `reviewGrowthWindow` / `rankGrowthWindow`,
   * which are span statistics over the whole window. Retained only for callers
   * not yet migrated off `signalsFromContext`'s `*Prior` fields.
   */
  prior: AppSnapshot | null;
  /** Span-based review-count growth for `period`, gated by data coverage. */
  reviewGrowthWindow: GrowthWindow;
  /** Span-based chart-rank growth for `period` (lower rank = better; sign reflects raw value). */
  rankGrowthWindow: GrowthWindow;
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

/**
 * Legacy endpoint: the latest snapshot at or before `currentDate − period`,
 * from an already-loaded ascending series. Kept only to populate the
 * deprecated `SnapshotContext.prior`; new growth uses span windows.
 */
function priorFromSnapshots(
  snapshots: AppSnapshot[],
  currentDate: string,
  period: GrowthPeriod,
): AppSnapshot | null {
  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;
  const targetDate = daysBefore(currentDate, periodDays);
  let best: AppSnapshot | null = null;
  for (const row of snapshots) {
    if (row.snapshotDate <= targetDate) best = row;
    if (row.snapshotDate > targetDate) break;
  }
  return best;
}

/** Project ordered snapshots into a sparse daily series for one metric (absent values dropped — never zeroed). */
export function seriesFromSnapshots(
  snapshots: AppSnapshot[],
  metric: GrowthMetric,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const snap of snapshots) {
    const value = snap[metric];
    if (value == null) continue;
    points.push({ date: snap.snapshotDate, value });
  }
  return points;
}

/**
 * Span-based growth window for one app/metric, computed on read from the
 * immutable daily series (ADR-0001). Returns "building" until coverage clears
 * the gate. `asOf` defaults to the latest snapshot date.
 */
export async function getGrowthWindow(
  db: Db,
  appId: string,
  metric: GrowthMetric,
  period: GrowthPeriod = "7d",
  asOf?: string,
): Promise<GrowthWindow | null> {
  const snapshots = await listHistoricals(db, appId);
  const anchor = asOf ?? snapshots.at(-1)?.snapshotDate;
  if (!anchor) return null;
  return computeGrowthWindow(seriesFromSnapshots(snapshots, metric), anchor, period);
}

/**
 * Compute several windows for one app/metric from a single series load. The
 * discovery surface ranks on multiple lenses (7d "trending now", 30/90d
 * stability) at once; doing it here avoids re-querying the series per window
 * and keeps "add a window" a read-time change (ADR-0001), not a migration.
 * Returns an empty record when the app has no snapshots.
 */
export async function getGrowthWindows(
  db: Db,
  appId: string,
  metric: GrowthMetric,
  periods: GrowthPeriod[],
  asOf?: string,
): Promise<Partial<Record<GrowthPeriod, GrowthWindow>>> {
  const snapshots = await listHistoricals(db, appId);
  const anchor = asOf ?? snapshots.at(-1)?.snapshotDate;
  if (!anchor) return {};
  const series = seriesFromSnapshots(snapshots, metric);
  const out: Partial<Record<GrowthPeriod, GrowthWindow>> = {};
  for (const period of periods) {
    out[period] = computeGrowthWindow(series, anchor, period);
  }
  return out;
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

  // Load the whole immutable daily series once; latest, the legacy prior
  // endpoint, and the span-based windows are all derived from it in memory.
  const snapshots = await listHistoricals(db, appId);
  const latest = snapshots.at(-1) ?? null;
  if (!latest) return null;

  const prior = priorFromSnapshots(snapshots, latest.snapshotDate, period);

  const reviewGrowthWindow = computeGrowthWindow(
    seriesFromSnapshots(snapshots, "reviewCount"),
    latest.snapshotDate,
    period,
  );
  const rankGrowthWindow = computeGrowthWindow(
    seriesFromSnapshots(snapshots, "chartRank"),
    latest.snapshotDate,
    period,
  );

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
    reviewGrowthWindow,
    rankGrowthWindow,
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

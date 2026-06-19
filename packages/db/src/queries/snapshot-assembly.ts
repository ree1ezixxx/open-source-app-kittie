import { and, count, eq, inArray } from "drizzle-orm";
import type { GrowthPeriod } from "@kittie/types";
import { GROWTH_PERIOD_DAYS } from "@kittie/intelligence";
import type { Db } from "../client.js";
import { apps, appSnapshots, iaps, metaAds, type App, type AppSnapshot } from "../schema.js";

export interface SnapshotContext {
  app: App;
  latest: AppSnapshot;
  prior: AppSnapshot | null;
  /** Actual day gap latest→prior — shorter than the period when history is thin. */
  priorDays: number | null;
  iapCount: number;
  metaAdCount: number;
  metaAdCountPrior: number | null;
  categoryAppCount: number;
}

export function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function dayGap(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000,
  );
}

/**
 * Prior = last snapshot on/before (latest − periodDays). When history is
 * thinner than the period, fall back to the OLDEST snapshot before the latest.
 */
export function pickPrior(
  sortedSnaps: AppSnapshot[],
  latestDate: string,
  periodDays: number,
): AppSnapshot | null {
  const targetDate = daysBefore(latestDate, periodDays);
  let best: AppSnapshot | null = null;
  for (const row of sortedSnaps) {
    if (row.snapshotDate <= targetDate) best = row;
    if (row.snapshotDate > targetDate) break;
  }
  if (best) return best;
  const oldest = sortedSnaps[0];
  return oldest && oldest.snapshotDate < latestDate ? oldest : null;
}

export interface AssembleSnapshotContextInput {
  app: App;
  sortedSnaps: AppSnapshot[];
  periodDays: number;
  iapCount: number;
  metaRows: { firstSeenAt: Date | null }[];
  categoryAppCount: number;
}

/** Build one SnapshotContext from pre-loaded rows (snapshots oldest→newest). */
export function assembleSnapshotContext(input: AssembleSnapshotContextInput): SnapshotContext | null {
  const latest = input.sortedSnaps.at(-1);
  if (!latest) return null;

  const prior = pickPrior(input.sortedSnaps, latest.snapshotDate, input.periodDays);
  const metaAdCountPrior = prior
    ? input.metaRows.filter((ad) => ad.firstSeenAt && ad.firstSeenAt <= prior.createdAt).length
    : null;

  return {
    app: input.app,
    latest,
    prior,
    priorDays: prior ? dayGap(latest.snapshotDate, prior.snapshotDate) : null,
    iapCount: input.iapCount,
    metaAdCount: input.metaRows.length,
    metaAdCountPrior,
    categoryAppCount: input.categoryAppCount,
  };
}

export interface BuildSnapshotContextsOptions {
  appIds: string[];
  period?: GrowthPeriod;
  /** Chart country pin (ADR 0007). Default US. */
  chartCountry?: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Bulk-load Snapshot contexts for a bounded app id set — the read path Explore
 * uses after SQL candidate selection. Scoped to one chart country per call.
 */
export async function buildSnapshotContextsForApps(
  db: Db,
  options: BuildSnapshotContextsOptions,
): Promise<Map<string, SnapshotContext>> {
  const { appIds, period = "7d", chartCountry = "US" } = options;
  const map = new Map<string, SnapshotContext>();
  if (!appIds.length) return map;

  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;
  const appRows: App[] = [];
  const snapRows: AppSnapshot[] = [];
  const iapRows: { appId: string }[] = [];
  const metaRows: { appId: string; firstSeenAt: Date | null }[] = [];

  for (const part of chunk(appIds, 400)) {
    const [a, s, i, m] = await Promise.all([
      db.select().from(apps).where(inArray(apps.id, part)),
      db
        .select()
        .from(appSnapshots)
        .where(and(inArray(appSnapshots.appId, part), eq(appSnapshots.chartCountry, chartCountry)))
        .orderBy(appSnapshots.appId, appSnapshots.snapshotDate),
      db.select({ appId: iaps.appId }).from(iaps).where(inArray(iaps.appId, part)),
      db
        .select({ appId: metaAds.appId, firstSeenAt: metaAds.firstSeenAt })
        .from(metaAds)
        .where(inArray(metaAds.appId, part)),
    ]);
    appRows.push(...a);
    snapRows.push(...s);
    iapRows.push(...i);
    metaRows.push(...m);
  }

  const snapsByApp = new Map<string, AppSnapshot[]>();
  for (const snap of snapRows) {
    const list = snapsByApp.get(snap.appId);
    if (list) list.push(snap);
    else snapsByApp.set(snap.appId, [snap]);
  }

  const iapCountByApp = new Map<string, number>();
  for (const { appId } of iapRows) iapCountByApp.set(appId, (iapCountByApp.get(appId) ?? 0) + 1);

  const metaByApp = new Map<string, typeof metaRows>();
  for (const ad of metaRows) {
    const list = metaByApp.get(ad.appId);
    if (list) list.push(ad);
    else metaByApp.set(ad.appId, [ad]);
  }

  const cats = [...new Set(appRows.map((a) => a.category).filter((c): c is string => !!c))];
  const categoryCount = new Map<string, number>();
  for (const part of chunk(cats, 400)) {
    const grouped = await db
      .select({ category: apps.category, c: count() })
      .from(apps)
      .where(inArray(apps.category, part))
      .groupBy(apps.category);
    for (const r of grouped) if (r.category) categoryCount.set(r.category, r.c);
  }

  for (const app of appRows) {
    const snaps = snapsByApp.get(app.id);
    if (!snaps?.length) continue;
    const ctx = assembleSnapshotContext({
      app,
      sortedSnaps: snaps,
      periodDays,
      iapCount: iapCountByApp.get(app.id) ?? 0,
      metaRows: metaByApp.get(app.id) ?? [],
      categoryAppCount: app.category ? (categoryCount.get(app.category) ?? 0) : 0,
    });
    if (ctx) map.set(app.id, ctx);
  }

  return map;
}

/** Review count at the Growth-period prior — for chart revenue estimates. */
export async function reviewCountPriorForApps(
  db: Db,
  appIds: string[],
  chartCountry: string,
  periodDays: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!appIds.length) return map;

  for (const part of chunk(appIds, 400)) {
    const rows = await db
      .select({
        appId: appSnapshots.appId,
        snapshotDate: appSnapshots.snapshotDate,
        reviewCount: appSnapshots.reviewCount,
      })
      .from(appSnapshots)
      .where(and(inArray(appSnapshots.appId, part), eq(appSnapshots.chartCountry, chartCountry)))
      .orderBy(appSnapshots.appId, appSnapshots.snapshotDate);

    const byApp = new Map<string, { snapshotDate: string; reviewCount: number }[]>();
    for (const r of rows) {
      const list = byApp.get(r.appId);
      if (list) list.push(r);
      else byApp.set(r.appId, [r]);
    }

    for (const [appId, series] of byApp) {
      const latest = series.at(-1)!;
      const target = daysBefore(latest.snapshotDate, periodDays);
      let best: { snapshotDate: string; reviewCount: number } | null = null;
      for (const row of series) {
        if (row.snapshotDate <= target) best = row;
        if (row.snapshotDate > target) break;
      }
      if (!best && series[0] && series[0].snapshotDate < latest.snapshotDate) best = series[0];
      if (best) map.set(appId, best.reviewCount);
    }
  }

  return map;
}

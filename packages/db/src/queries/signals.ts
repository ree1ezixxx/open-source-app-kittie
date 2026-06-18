import { and, count, eq, getTableColumns, gt, gte, lte, sql } from "drizzle-orm";
import type { GrowthPeriod } from "@kittie/types";
import { GROWTH_PERIOD_DAYS } from "@kittie/intelligence";
import type { Db } from "../client.js";
import {
  apps,
  appSnapshots,
  iaps,
  metaAds,
  type App,
  type AppSnapshot,
} from "../schema.js";

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
  /** Last ≤7 daily review counts (oldest→newest) for the row sparkline. */
  sparkline: number[];
  /** Signed chart-rank movement (prior − latest) across the two most recent
   *  ranked days; null when fewer than two snapshots carry a chart rank. */
  rankDelta: number | null;
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

function dayGap(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000,
  );
}

/**
 * Prior = last snapshot on/before (latest − periodDays). When history is
 * thinner than the period, fall back to the OLDEST snapshot before the latest
 * — consumers scale the observed delta to the period via `priorDays`.
 */
function pickPrior(
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

/** Last ≤7 review counts (oldest→newest) for the row sparkline. */
function sparklineFrom(sortedSnaps: AppSnapshot[]): number[] {
  return sortedSnaps.slice(-7).map((s) => s.reviewCount);
}

/**
 * Signed chart-rank movement (prior − latest; positive = climbed) across the two
 * most recent snapshots that carry a chart rank; null when fewer than two do.
 */
function rankDeltaFrom(sortedSnaps: AppSnapshot[]): number | null {
  const ranked: number[] = [];
  for (const s of sortedSnaps) if (s.chartRank != null) ranked.push(s.chartRank);
  if (ranked.length < 2) return null;
  return ranked[ranked.length - 2]! - ranked[ranked.length - 1]!;
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

  const allSnaps = await db
    .select()
    .from(appSnapshots)
    .where(eq(appSnapshots.appId, appId))
    .orderBy(appSnapshots.snapshotDate);
  const latest = allSnaps.at(-1) ?? null;
  if (!latest) return null;

  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;
  const prior = pickPrior(allSnaps, latest.snapshotDate, periodDays);

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
    priorDays: prior ? dayGap(latest.snapshotDate, prior.snapshotDate) : null,
    iapCount: iapRow?.value ?? 0,
    metaAdCount: metaRows.length,
    metaAdCountPrior,
    categoryAppCount: await countAppsInCategory(db, app.category),
    sparkline: sparklineFrom(allSnaps),
    rankDelta: rankDeltaFrom(allSnaps),
  };
}

/**
 * Stream every app's snapshot context in id-ordered chunks, instead of loading
 * the whole catalog (1.1M apps + 3M snapshots + contexts) into memory at once —
 * that all-at-once build peaked ~7GB and was the Explore OOM. Each chunk keysets
 * the next `chunkSize` apps (`id > lastId`), then range-scans their snapshots /
 * iaps / meta ads by the contiguous id window (`app_id BETWEEN firstId..lastId`,
 * exact because keyset chunks are gap-free), assembles contexts, and yields. The
 * caller scores + discards each chunk, so only the retained scored rows plus one
 * chunk are ever live — peak stays a couple GB regardless of catalog size.
 */
export async function* streamSnapshotContexts(
  db: Db,
  period: GrowthPeriod = "7d",
  chunkSize = 5000,
): AsyncGenerator<SnapshotContext[]> {
  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;

  // Category totals from one grouped query — never load the full apps list.
  const categoryCount = new Map<string, number>();
  for (const r of await db
    .select({ category: apps.category, n: count() })
    .from(apps)
    .groupBy(apps.category)) {
    if (r.category) categoryCount.set(r.category, Number(r.n));
  }

  let lastId = "";
  for (;;) {
    const appChunk = await db
      .select({
        // List/score/filter never read description or screenshotUrls — null them
        // so SQLite never ships the heavy listing text (avg ~1.9KB/row). App shape intact.
        ...getTableColumns(apps),
        description: sql<string | null>`NULL`,
        screenshotUrls: sql<string | null>`NULL`,
      })
      .from(apps)
      .where(gt(apps.id, lastId))
      .orderBy(apps.id)
      .limit(chunkSize);
    if (appChunk.length === 0) break;
    const firstId = appChunk[0]!.id;
    lastId = appChunk[appChunk.length - 1]!.id;

    const [snaps, iapRows, metaRows] = await Promise.all([
      db
        .select()
        .from(appSnapshots)
        .where(and(gte(appSnapshots.appId, firstId), lte(appSnapshots.appId, lastId)))
        .orderBy(appSnapshots.appId, appSnapshots.snapshotDate),
      db
        .select({ appId: iaps.appId })
        .from(iaps)
        .where(and(gte(iaps.appId, firstId), lte(iaps.appId, lastId))),
      db
        .select()
        .from(metaAds)
        .where(and(gte(metaAds.appId, firstId), lte(metaAds.appId, lastId))),
    ]);

    // Group this chunk's children by appId (snapshots arrive pre-sorted by date).
    const snapshotsByApp = new Map<string, AppSnapshot[]>();
    for (const snap of snaps) {
      const list = snapshotsByApp.get(snap.appId);
      if (list) list.push(snap);
      else snapshotsByApp.set(snap.appId, [snap]);
    }
    const iapCountByApp = new Map<string, number>();
    for (const { appId } of iapRows) iapCountByApp.set(appId, (iapCountByApp.get(appId) ?? 0) + 1);
    const metaAdsByApp = new Map<string, typeof metaRows>();
    for (const ad of metaRows) {
      const list = metaAdsByApp.get(ad.appId);
      if (list) list.push(ad);
      else metaAdsByApp.set(ad.appId, [ad]);
    }

    const contexts: SnapshotContext[] = [];
    for (const app of appChunk) {
      const appSnaps = snapshotsByApp.get(app.id);
      const latest = appSnaps?.at(-1);
      if (!latest) continue; // mirrors getSnapshotContext: no snapshot → skip

      const prior = pickPrior(appSnaps!, latest.snapshotDate, periodDays);
      const appMetaRows = metaAdsByApp.get(app.id) ?? [];
      const metaAdCountPrior = prior
        ? appMetaRows.filter((ad) => ad.firstSeenAt && ad.firstSeenAt <= prior.createdAt).length
        : null;

      contexts.push({
        app,
        latest,
        prior,
        priorDays: prior ? dayGap(latest.snapshotDate, prior.snapshotDate) : null,
        iapCount: iapCountByApp.get(app.id) ?? 0,
        metaAdCount: appMetaRows.length,
        metaAdCountPrior,
        categoryAppCount: app.category ? (categoryCount.get(app.category) ?? 0) : 0,
        sparkline: sparklineFrom(appSnaps!),
        rankDelta: rankDeltaFrom(appSnaps!),
      });
    }

    if (contexts.length > 0) yield contexts;
  }
}

export async function listHistoricals(db: Db, appId: string): Promise<AppSnapshot[]> {
  return db
    .select()
    .from(appSnapshots)
    .where(eq(appSnapshots.appId, appId))
    .orderBy(appSnapshots.snapshotDate);
}

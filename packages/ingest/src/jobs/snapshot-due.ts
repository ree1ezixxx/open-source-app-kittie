#!/usr/bin/env node
/**
 * Due-driven snapshot pass (ADR 0008).
 *
 * Replaces the catalog-iterating `snapshot-bulk` (which materialised all ~1.1M
 * apps into one array → ~4 GB heap → OOM). Instead it asks the DB *what is
 * overdue*, snapshots a bounded slice, and advances each app's
 * `lastSnapshotDate`. The row state IS the checkpoint: a crash mid-pass resumes
 * from the still-due set with no bookkeeping. Memory is bounded by one batch +
 * the (~few-k) chart lookup + the hot id set — never the catalog.
 *
 * Tiers (ADR 0007's market-visible vs long-tail, made executable):
 *   - HOT  = currently-charting ∪ tracked apps. Due if not snapshotted *today*.
 *   - COLD = the long tail. Due if `lastSnapshotDate` older than a rolling
 *            window. Drained after hot, bounded per cycle.
 */
import { loadEnv } from "@kittie/core";
import {
  apps,
  appSnapshots,
  createDb,
  enrichSnapshotScores,
  recordSweepRun,
  trackedApps,
  type Db,
} from "@kittie/db";
import { and, asc, inArray, isNull, lt, or } from "drizzle-orm";

import { lookupAppleApps } from "../apple/lookup.js";
import { upsertSnapshot } from "../db/apps.js";
import { fetchGoogleAppMetadata } from "../google/metadata.js";
import { chartRankForApp, fetchChartRankLookup, type ChartRankEntry } from "../util/chart-lookup.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

const APPLE_BATCH_SIZE = 200; // iTunes lookup ceiling; lookup.ts sub-chunks at 50/req
const REQUESTS_PER_BATCH = APPLE_BATCH_SIZE / 50;
const NORMAL_REQS_PER_SEC = 5;
const SLOW_REQS_PER_SEC = 2; // back off when Apple rate-limits (403/429)
const ID_CHUNK = 400; // keep `IN (...)` parameter counts well under SQLite's limit
const GOOGLE_GAP_MS = 150;

interface DueApp {
  id: string;
  store: "apple" | "google";
  storeAppId: string;
}

export interface SnapshotDueOptions {
  /** Long-tail rolling window (days). Cold apps older than this are due. */
  coldWindowDays?: number;
  /** Max cold (long-tail) apps to snapshot per cycle. Hot is always fully drained. */
  coldBatch?: number;
  /** Safety ceiling on the hot set size per cycle. */
  hotCap?: number;
  /** Injectable for tests; defaults to a fresh client. */
  db?: Db;
}

export interface SnapshotDueResult {
  snapshotDate: string;
  hotDue: number;
  coldDue: number;
  written: number;
  skipped: number;
  ms: number;
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("403") || message.includes("429");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** YYYY-MM-DD `windowDays` ago (UTC). Cold apps with `lastSnapshotDate` before this are due. */
function cutoffDate(windowDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - windowDays);
  return d.toISOString().slice(0, 10);
}

/** Hot candidates that still need *today's* snapshot, resolved against real catalog rows. */
async function loadHotDue(
  db: Db,
  candidateIds: string[],
  snapshotDate: string,
  cap: number,
): Promise<DueApp[]> {
  const due: DueApp[] = [];
  for (const ids of chunk(candidateIds, ID_CHUNK)) {
    if (due.length >= cap) break;
    // id-bounded (≤ID_CHUNK params) AND exists in catalog AND not snapshotted today.
    const rows = await db
      .select({ id: apps.id, store: apps.store, storeAppId: apps.storeAppId })
      .from(apps)
      .where(
        and(
          inArray(apps.id, ids),
          or(isNull(apps.lastSnapshotDate), lt(apps.lastSnapshotDate, snapshotDate)),
        ),
      );
    due.push(...rows);
  }
  return due.slice(0, cap);
}

/** Long-tail apps whose newest snapshot predates the rolling window, oldest first. */
async function loadColdDue(db: Db, cutoff: string, limit: number): Promise<DueApp[]> {
  if (limit <= 0) return [];
  return db
    .select({ id: apps.id, store: apps.store, storeAppId: apps.storeAppId })
    .from(apps)
    .where(or(isNull(apps.lastSnapshotDate), lt(apps.lastSnapshotDate, cutoff)))
    .orderBy(asc(apps.lastSnapshotDate)) // NULLs first in SQLite → most-due first
    .limit(limit);
}

/** Mark the apps we successfully snapshotted as fresh-as-of `snapshotDate`. */
async function bumpLastSnapshot(db: Db, ids: string[], snapshotDate: string): Promise<void> {
  for (const part of chunk(ids, ID_CHUNK)) {
    await db.update(apps).set({ lastSnapshotDate: snapshotDate }).where(inArray(apps.id, part));
  }
}

/**
 * Snapshot a bounded list of apps: Apple via batched iTunes lookups (throttled,
 * backing off on rate-limit), Google per-app. Scores each written snapshot and
 * advances `lastSnapshotDate`. Returns written/skipped counts. Bounded memory.
 */
async function snapshotApps(
  db: Db,
  list: DueApp[],
  chartLookup: Map<string, ChartRankEntry>,
  snapshotDate: string,
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;

  const appleApps = list.filter((a) => a.store === "apple");
  const googleApps = list.filter((a) => a.store === "google");

  // --- Apple: batches of 200, ~5 req/s, slowing to 2 req/s on 403/429. ---
  const appIdByStoreAppId = new Map(appleApps.map((a) => [a.storeAppId, a.id]));
  let reqsPerSec = NORMAL_REQS_PER_SEC;
  for (const slice of chunk(appleApps, APPLE_BATCH_SIZE)) {
    const batchStartedAt = Date.now();
    const done: string[] = [];
    try {
      const metas = await lookupAppleApps(slice.map((a) => a.storeAppId));
      const seen = new Set<string>();
      for (const meta of metas) {
        const appId = appIdByStoreAppId.get(meta.storeAppId);
        if (!appId) continue;
        seen.add(meta.storeAppId);
        const chart = chartRankForApp(chartLookup, "apple", meta.storeAppId);
        await upsertSnapshot(db, {
          appId,
          snapshotDate,
          reviewCount: meta.reviewCount,
          rating: meta.rating,
          chartRank: chart?.chartRank ?? null,
          chartCategory: chart?.chartCategory ?? null,
          chartCountry: chart?.chartCountry ?? "US",
        });
        await enrichSnapshotScores(db, appId, snapshotDate);
        done.push(appId);
        written++;
      }
      skipped += slice.length - seen.size;
    } catch (error) {
      skipped += slice.length;
      if (isRateLimitError(error) && reqsPerSec !== SLOW_REQS_PER_SEC) {
        reqsPerSec = SLOW_REQS_PER_SEC;
        console.warn(`[snapshot-due] apple rate-limited — slowing to ${SLOW_REQS_PER_SEC} req/s`);
      }
    }
    if (done.length) await bumpLastSnapshot(db, done, snapshotDate);

    const minBatchMs = (REQUESTS_PER_BATCH / reqsPerSec) * 1000;
    const elapsed = Date.now() - batchStartedAt;
    if (elapsed < minBatchMs) await sleep(minBatchMs - elapsed);
  }

  // --- Google: per-app metadata fetch, paced. ---
  for (const app of googleApps) {
    try {
      const meta = await fetchGoogleAppMetadata(app.storeAppId);
      const chart = chartRankForApp(chartLookup, "google", app.storeAppId);
      await upsertSnapshot(db, {
        appId: app.id,
        snapshotDate,
        reviewCount: meta.reviewCount,
        rating: meta.rating,
        chartRank: chart?.chartRank ?? null,
        chartCategory: chart?.chartCategory ?? null,
        chartCountry: chart?.chartCountry ?? "US",
      });
      await enrichSnapshotScores(db, app.id, snapshotDate);
      await bumpLastSnapshot(db, [app.id], snapshotDate);
      written++;
    } catch (error) {
      console.warn(`[snapshot-due] skip ${app.id}: ${(error as Error).message}`);
      skipped++;
    }
    await sleep(GOOGLE_GAP_MS);
  }

  return { written, skipped };
}

/**
 * One due-driven cycle: drain the hot tier (charting ∪ tracked, daily), then a
 * bounded slice of the cold tier (long tail, rolling window). Records its own
 * `sweep_state` row so the API's `/freshness` reflects progress across processes.
 */
export async function runSnapshotDue(opts: SnapshotDueOptions = {}): Promise<SnapshotDueResult> {
  loadEnv();
  const db = opts.db ?? createDb();
  const snapshotDate = todaySnapshotDate();
  const coldWindowDays = opts.coldWindowDays ?? 7;
  const coldBatch = opts.coldBatch ?? 2000;
  const hotCap = opts.hotCap ?? 20_000;
  const started = Date.now();

  // 1) Live chart ranks (US for this slice; multi-country is an ADR 0008 follow-up).
  const chartLookup = await fetchChartRankLookup("us");

  // 2) HOT set: chart lookup keys are `${store}:${storeAppId}` === apps.id, so the
  //    charting app ids need no parsing. Union with tracked apps, resolve to real
  //    rows, keep only those still missing today's snapshot.
  const chartingIds = [...chartLookup.keys()];
  const trackedRows = await db.select({ appId: trackedApps.appId }).from(trackedApps);
  const candidateHotIds = [...new Set([...chartingIds, ...trackedRows.map((r) => r.appId)])];
  const hotApps = await loadHotDue(db, candidateHotIds, snapshotDate, hotCap);
  const hot = await snapshotApps(db, hotApps, chartLookup, snapshotDate);

  // 3) COLD slice: long tail older than the window. Hot apps just bumped to today
  //    fall outside the cutoff, so they're never double-processed.
  const coldApps = await loadColdDue(db, cutoffDate(coldWindowDays), coldBatch);
  const cold = await snapshotApps(db, coldApps, chartLookup, snapshotDate);

  const written = hot.written + cold.written;
  const skipped = hot.skipped + cold.skipped;
  const summary =
    `hot ${hot.written}/${hotApps.length}, cold ${cold.written}/${coldApps.length}` +
    ` (window ${coldWindowDays}d)`;
  await recordSweepRun(db, "snapshots-daily", summary);

  return {
    snapshotDate,
    hotDue: hotApps.length,
    coldDue: coldApps.length,
    written,
    skipped,
    ms: Date.now() - started,
  };
}

const isMain = process.argv[1]?.includes("snapshot-due");
if (isMain) {
  runSnapshotDue()
    .then((r) => {
      console.log(`[snapshot-due] ${JSON.stringify(r)}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("[snapshot-due] fatal:", error);
      process.exit(1);
    });
}

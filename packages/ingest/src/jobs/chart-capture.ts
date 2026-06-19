#!/usr/bin/env node
/**
 * Coherent daily chart capture (Trending rank-delta fix, ADR 0009).
 *
 * Writes the day's leaderboards into `chart_rankings` — one row per
 * (app, chart, day, market) so an app holds every chart it's on. Per leaderboard
 * the ranks are unique, so the read assembler accepts the day and the 24h delta
 * resolves against the prior clean day.
 *
 * Per country it SET-REPLACEs the WHOLE day (delete today's rows for the country,
 * insert the current members) so a leaderboard that vanishes on a re-run can't
 * leave stale rows. Each country is isolated in its own try/catch, so one market's
 * feed failure doesn't discard the others. Fetch happens BEFORE the delete, so a
 * failed fetch never wipes the day.
 *
 * It also DENORMALIZES each charting app's single best rank back onto
 * `app_snapshots.chart_rank` (via {@link upsertChartRankOnSnapshot}) for the
 * legacy readers (scoring signals, Hot-Ideas gate, Highlights Gainers/Losers,
 * rankDelta sort) that still source rank from the snapshot row. Once per day, from
 * the coherent set, so it never re-pollutes.
 */
import { loadEnv } from "@kittie/core";
import { apps, appSnapshots, chartRankings, createDb, type Db } from "@kittie/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { fetchAppleCharts, fetchAppleGenreCharts } from "../apple/charts.js";
import { upsertChartRankOnSnapshot } from "../db/apps.js";
import { fetchGoogleCharts } from "../google/metadata.js";
import { todaySnapshotDate } from "../util/dates.js";
import { makeAppId } from "../util/ids.js";

const ID_CHUNK = 400;

interface Member {
  appId: string;
  store: "apple" | "google";
  encoding: string; // chart_category, e.g. "top-free" or "top-free:Games"
  rank: number;
}

export interface ChartCaptureResult {
  snapshotDate: string;
  countries: string[]; // countries successfully captured
  failed: string[]; // countries whose fetch failed (skipped, prior data untouched)
  written: number; // chart_rankings rows inserted
  denormalized: number; // app_snapshots primary-rank stamps
  ms: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Keep only member ids that exist in the catalog (FK + honest: we don't chart apps we don't have). */
async function existingAppIds(db: Db, ids: string[]): Promise<Set<string>> {
  const present = new Set<string>();
  for (const part of chunk([...new Set(ids)], ID_CHUNK)) {
    const rows = await db.select({ id: apps.id }).from(apps).where(inArray(apps.id, part));
    for (const r of rows) present.add(r.id);
  }
  return present;
}

const isOverall = (encoding: string): boolean => !encoding.includes(":");

/** An app's single best position: overall chart preferred, then lowest rank. */
function primaryMember(members: Member[]): Member {
  const pool = members.some((m) => isOverall(m.encoding))
    ? members.filter((m) => isOverall(m.encoding))
    : members;
  return pool.reduce((best, m) => (m.rank < best.rank ? m : best));
}

/**
 * Capture every leaderboard for each country as a coherent set in `chart_rankings`
 * for `snapshotDate`, and denormalize each app's primary rank onto `app_snapshots`.
 * Bounded memory (one country's feeds at a time).
 */
export async function captureChartRanks(
  db: Db,
  opts: { countries?: string[]; snapshotDate?: string } = {},
): Promise<ChartCaptureResult> {
  const snapshotDate = opts.snapshotDate ?? todaySnapshotDate();
  const countries = (opts.countries ?? ["US"]).map((c) => c.toUpperCase());
  const now = new Date();
  const started = Date.now();
  const done: string[] = [];
  const failed: string[] = [];
  let written = 0;
  let denormalized = 0;

  for (const cc of countries) {
    const country = cc.toLowerCase();
    try {
      // 1) Fetch FIRST — a failure here skips the country without wiping its day.
      const [overall, genre, google] = await Promise.all([
        fetchAppleCharts(country, 100),
        fetchAppleGenreCharts(country, 100),
        fetchGoogleCharts(country, 50),
      ]);

      const members: Member[] = [
        ...[...overall, ...genre].map((e) => ({
          appId: makeAppId("apple", e.storeAppId),
          store: "apple" as const,
          encoding: e.chartCategory,
          rank: e.chartRank,
        })),
        ...google.map((e) => ({
          appId: makeAppId("google", e.storeAppId),
          store: "google" as const,
          encoding: e.chartCategory,
          rank: e.chartRank,
        })),
      ];

      // Drop members not in the catalog (apple-discover adds new ones separately).
      const present = await existingAppIds(db, members.map((m) => m.appId));
      const live = members.filter((m) => present.has(m.appId));

      // 2) SET-REPLACE the whole country's day → stale/vanished leaderboards cleared.
      await db
        .delete(chartRankings)
        .where(and(eq(chartRankings.snapshotDate, snapshotDate), eq(chartRankings.country, cc)));
      for (const part of chunk(live, 200)) {
        await db.insert(chartRankings).values(
          part.map((m) => ({
            id: `${m.encoding}:${cc}:${snapshotDate}:${m.appId}`,
            appId: m.appId,
            store: m.store,
            snapshotDate,
            country: cc,
            chartCategory: m.encoding,
            rank: m.rank,
            createdAt: now,
          })),
        );
        written += part.length;
      }

      // 3) Denormalize each app's PRIMARY rank onto app_snapshots for the legacy
      //    readers. Clear today's stamps for this market first (so apps that fell
      //    off are reset), then stamp the current charting set.
      await db
        .update(appSnapshots)
        .set({ chartRank: null, chartCategory: null })
        .where(
          and(
            eq(appSnapshots.snapshotDate, snapshotDate),
            eq(appSnapshots.chartCountry, cc),
            isNotNull(appSnapshots.chartRank),
          ),
        );
      const byApp = new Map<string, Member[]>();
      for (const m of live) {
        const g = byApp.get(m.appId);
        if (g) g.push(m);
        else byApp.set(m.appId, [m]);
      }
      for (const [appId, ms] of byApp) {
        const p = primaryMember(ms);
        await upsertChartRankOnSnapshot(db, {
          appId,
          snapshotDate,
          chartRank: p.rank,
          chartCategory: p.encoding,
          chartCountry: cc,
        });
        denormalized++;
      }

      done.push(cc);
    } catch (e) {
      console.warn(`[chart-capture] ${cc} skipped: ${e instanceof Error ? e.message : e}`);
      failed.push(cc);
    }
  }

  return { snapshotDate, countries: done, failed, written, denormalized, ms: Date.now() - started };
}

const isMain = process.argv[1]?.includes("chart-capture");
if (isMain) {
  loadEnv();
  const countries = (process.env.CHART_COUNTRIES ?? "US").split(",").map((s) => s.trim()).filter(Boolean);
  captureChartRanks(createDb(), { countries })
    .then((r) => {
      console.log(`[chart-capture] ${JSON.stringify(r)}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[chart-capture] fatal:", e);
      process.exit(1);
    });
}

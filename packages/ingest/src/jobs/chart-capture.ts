#!/usr/bin/env node
/**
 * Coherent daily chart capture (Trending rank-delta fix).
 *
 * Writes the day's leaderboards into the dedicated `chart_rankings` table — ONE
 * row per (app, chart, day, market). Each app can sit on many charts at once
 * (#5 overall Free AND #1 in Games); the old single chart slot on `app_snapshots`
 * could not hold that, so overall charts came back half-empty and ranks duplicated
 * across the day → the read assembler rejected every "unclean" day → 24h deltas
 * were null.
 *
 * Per leaderboard we SET-REPLACE: delete today's rows for that (store, country,
 * encoding) and insert the current members. Idempotent, so a restart re-running
 * it is harmless, and each leaderboard has unique ranks → clean day → deltas
 * resolve against the prior clean day. Run once per UTC day to match truth's
 * periodic "Updated Nh ago" snapshot.
 */
import { loadEnv } from "@kittie/core";
import { apps, chartRankings, createDb, type Db } from "@kittie/db";
import { and, eq, inArray } from "drizzle-orm";

import { fetchAppleCharts, fetchAppleGenreCharts } from "../apple/charts.js";
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
  countries: string[];
  leaderboards: number; // (store, country, encoding) groups written
  written: number; // member rows inserted
  cleared: number; // prior rows deleted
  ms: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rowsAffected(res: unknown): number {
  return (res as { rowsAffected?: number }).rowsAffected ?? 0;
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

/**
 * Capture every leaderboard for each country as a coherent set in `chart_rankings`
 * for `snapshotDate`. Bounded memory (one country's feeds at a time).
 */
export async function captureChartRanks(
  db: Db,
  opts: { countries?: string[]; snapshotDate?: string } = {},
): Promise<ChartCaptureResult> {
  const snapshotDate = opts.snapshotDate ?? todaySnapshotDate();
  const countries = (opts.countries ?? ["US"]).map((c) => c.toUpperCase());
  const now = new Date();
  const started = Date.now();
  let leaderboards = 0;
  let written = 0;
  let cleared = 0;

  for (const cc of countries) {
    const country = cc.toLowerCase();
    // Each fetcher returns a coherent ranking per encoding (deduped, ranks 1..N).
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

    // Group into leaderboards: one coherent ranking per (store, encoding).
    const groups = new Map<string, Member[]>();
    for (const m of live) {
      const key = `${m.store}|${m.encoding}`;
      const g = groups.get(key);
      if (g) g.push(m);
      else groups.set(key, [m]);
    }

    for (const [, group] of groups) {
      const first = group[0];
      if (!first) continue;
      const { store, encoding } = first;
      leaderboards++;

      // SET-REPLACE: clear this leaderboard's day (store-scoped — apple & google
      // share encodings like "top-free"), then insert the current members.
      const del = await db
        .delete(chartRankings)
        .where(
          and(
            eq(chartRankings.snapshotDate, snapshotDate),
            eq(chartRankings.country, cc),
            eq(chartRankings.store, store),
            eq(chartRankings.chartCategory, encoding),
          ),
        );
      cleared += rowsAffected(del);

      for (const part of chunk(group, 200)) {
        await db.insert(chartRankings).values(
          part.map((m) => ({
            id: `${encoding}:${cc}:${snapshotDate}:${m.appId}`,
            appId: m.appId,
            store,
            snapshotDate,
            country: cc,
            chartCategory: encoding,
            rank: m.rank,
            createdAt: now,
          })),
        );
        written += part.length;
      }
    }
  }

  return { snapshotDate, countries, leaderboards, written, cleared, ms: Date.now() - started };
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

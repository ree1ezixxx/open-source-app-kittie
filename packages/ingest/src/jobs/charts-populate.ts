#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { fetchAppleGenreCharts } from "../apple/charts.js";
import { lookupAppleApps } from "../apple/lookup.js";
import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { todaySnapshotDate } from "../util/dates.js";

/**
 * One-shot populate for the full Apple/US Store-Rankings grid.
 *
 * Fetches all 3 chart types (free|paid|grossing) at overall + per-genre via the
 * iTunes-RSS ingest, enriches each charted app with its TRUE primary category
 * (so the page's `apps.category` filter resolves correctly — never the genre of
 * the chart it appeared in), and writes a chart-bearing snapshot for today.
 *
 * The per-(type, app) priority dedup lives in fetchAppleGenreCharts; here we
 * collapse to one membership per app (snapshot is unique on app+date), keeping
 * the FIRST emitted entry — overall charts win, then per-genre paid/grossing,
 * then per-genre free (see fetchAppleGenreCharts ordering).
 */
export async function runChartsPopulate(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();

  console.log("Fetching full Apple/US chart set (all 3 types × overall+genre)…");
  const entries = await fetchAppleGenreCharts("us", 100);
  console.log(`  ${entries.length} (type, app) chart entries`);

  // Collapse to one membership per app (first emitted wins — see ordering above).
  const chartByApp = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    if (!chartByApp.has(e.storeAppId)) chartByApp.set(e.storeAppId, e);
  }
  const appIds = [...chartByApp.keys()];
  console.log(`  ${appIds.length} unique charted apps`);

  console.log("Enriching with Apple metadata (true categories)…");
  const metas = await lookupAppleApps(appIds);
  const metaById = new Map(metas.map((m) => [m.storeAppId, m]));
  console.log(`  ${metas.length} apps enriched`);

  let written = 0;
  for (const storeAppId of appIds) {
    const chart = chartByApp.get(storeAppId)!;
    const meta = metaById.get(storeAppId);
    // No metadata → skip (never fabricate an app row).
    if (!meta) continue;

    const appId = await upsertApp(db, {
      store: "apple",
      storeAppId: meta.storeAppId,
      bundleId: meta.bundleId,
      title: meta.title,
      developer: meta.developer,
      category: meta.category,
      iconUrl: meta.iconUrl,
      description: meta.description,
      websiteUrl: meta.websiteUrl,
      price: meta.price,
      contentRating: meta.contentRating,
      languages: meta.languages,
      screenshotUrls: meta.screenshotUrls,
      releasedAt: meta.releasedAt,
      updatedAt: meta.updatedAt,
    });

    await upsertSnapshot(db, {
      appId,
      snapshotDate,
      reviewCount: meta.reviewCount,
      rating: meta.rating,
      chartRank: chart.chartRank,
      chartCategory: chart.chartCategory,
      chartCountry: chart.chartCountry,
    });
    written++;
  }

  console.log(`\nCharts populate complete: ${written} snapshots written for ${snapshotDate}`);
}

const isMain = process.argv[1]?.includes("charts-populate");
if (isMain) {
  runChartsPopulate().catch((error) => {
    console.error("Charts populate failed:", error);
    process.exit(1);
  });
}

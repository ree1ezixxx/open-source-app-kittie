#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { fetchAppleCharts } from "../apple/charts.js";
import { lookupAppleApps } from "../apple/lookup.js";
import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { fetchGoogleAppsMetadata, fetchGoogleCharts } from "../google/metadata.js";
import { todaySnapshotDate } from "../util/dates.js";

export async function runSeed(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();

  console.log("Fetching Apple charts…");
  const appleCharts = await fetchAppleCharts("us", 100);
  console.log(`  ${appleCharts.length} unique Apple chart entries`);

  const chartByAppId = new Map(
    appleCharts.map((entry) => [entry.storeAppId, entry]),
  );

  console.log("Looking up Apple metadata…");
  const appleLookups = await lookupAppleApps(appleCharts.map((e) => e.storeAppId));
  console.log(`  ${appleLookups.length} Apple apps enriched`);

  let appleCount = 0;
  for (const meta of appleLookups) {
    const chart = chartByAppId.get(meta.storeAppId);
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
      chartRank: chart?.chartRank ?? null,
      chartCategory: chart?.chartCategory ?? null,
      chartCountry: chart?.chartCountry ?? "US",
    });
    appleCount++;
  }

  console.log("Fetching Google Play charts…");
  const googleCharts = await fetchGoogleCharts("us", 50);
  console.log(`  ${googleCharts.length} unique Google chart entries`);

  const googleChartByAppId = new Map(
    googleCharts.map((entry) => [entry.storeAppId, entry]),
  );

  console.log("Fetching Google Play metadata (this may take a minute)…");
  const googleMetas = await fetchGoogleAppsMetadata(
    googleCharts.map((e) => e.storeAppId),
    "us",
    150,
  );
  console.log(`  ${googleMetas.length} Google apps enriched`);

  let googleCount = 0;
  for (const meta of googleMetas) {
    const chart = googleChartByAppId.get(meta.storeAppId);
    const appId = await upsertApp(db, {
      store: "google",
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
      screenshotUrls: meta.screenshotUrls,
      releasedAt: meta.releasedAt,
      updatedAt: meta.updatedAt,
    });

    await upsertSnapshot(db, {
      appId,
      snapshotDate,
      reviewCount: meta.reviewCount,
      rating: meta.rating,
      chartRank: chart?.chartRank ?? null,
      chartCategory: chart?.chartCategory ?? null,
      chartCountry: chart?.chartCountry ?? "US",
    });
    googleCount++;
  }

  const total = appleCount + googleCount;
  console.log(`\nSeed complete: ${appleCount} Apple + ${googleCount} Google = ${total} apps with snapshots`);
}

const isMain = process.argv[1]?.includes("seed");
if (isMain) {
  runSeed().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
}

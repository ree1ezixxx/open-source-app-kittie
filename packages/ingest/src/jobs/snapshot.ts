#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb, getLatestSnapshot } from "@kittie/db";

import { lookupAppleApp } from "../apple/lookup.js";
import { listTrackedApps, upsertSnapshot } from "../db/apps.js";
import { fetchGoogleAppMetadata } from "../google/metadata.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

export async function runSnapshot(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();
  const tracked = await listTrackedApps(db);

  console.log(`Refreshing snapshots for ${tracked.length} apps (${snapshotDate})…`);

  let success = 0;
  let failed = 0;

  for (const app of tracked) {
    try {
      if (app.store === "apple") {
        const meta = await lookupAppleApp(app.storeAppId);
        if (!meta) {
          console.warn(`  skip ${app.id}: lookup returned nothing`);
          failed++;
          continue;
        }

        const prior = await getLatestSnapshot(db, app.id);
        await upsertSnapshot(db, {
          appId: app.id,
          snapshotDate,
          reviewCount: meta.reviewCount,
          rating: meta.rating,
          chartRank: prior?.chartRank ?? null,
          chartCategory: prior?.chartCategory ?? null,
          chartCountry: prior?.chartCountry ?? "US",
        });
      } else {
        const meta = await fetchGoogleAppMetadata(app.storeAppId);
        const prior = await getLatestSnapshot(db, app.id);
        await upsertSnapshot(db, {
          appId: app.id,
          snapshotDate,
          reviewCount: meta.reviewCount,
          rating: meta.rating,
          chartRank: prior?.chartRank ?? null,
          chartCategory: prior?.chartCategory ?? null,
          chartCountry: prior?.chartCountry ?? "US",
        });
        await sleep(150);
      }
      success++;
    } catch (error) {
      console.warn(`  skip ${app.id}:`, error);
      failed++;
    }
  }

  console.log(`\nSnapshot complete: ${success} updated, ${failed} skipped`);
}

const isMain = process.argv[1]?.includes("snapshot");
if (isMain) {
  runSnapshot().catch((error) => {
    console.error("Snapshot failed:", error);
    process.exit(1);
  });
}

#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { apps, createDb } from "@kittie/db";

import { lookupAppleApps } from "../apple/lookup.js";
import { upsertSnapshot } from "../db/apps.js";
import { fetchGoogleAppMetadata } from "../google/metadata.js";
import { distributionStoreCapability } from "../store-capability.js";
import { chartRankForApp, fetchChartRankLookup } from "../util/chart-lookup.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

const BATCH_SIZE = 200; // iTunes lookup accepts up to ~200 ids; lookup.ts sub-chunks at 50/request
const REQUESTS_PER_BATCH = BATCH_SIZE / 50; // HTTP requests lookupAppleApps issues per batch
const NORMAL_REQS_PER_SEC = 5;
const SLOW_REQS_PER_SEC = 2; // fallback when Apple rate-limits (403/429)
const MAX_CONSECUTIVE_FAILURES = 5;
const LOG_EVERY_BATCHES = 50;

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("403") || message.includes("429");
}

export async function runSnapshotBulk(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();
  const startedAt = Date.now();

  console.log(`\n[snapshot-bulk] snapshot=${snapshotDate}`);
  console.log(`[snapshot-bulk] DB = ${process.env.DATABASE_URL ?? "(default repo data/kittie.db)"}\n`);

  // 1) Load ALL apps — slim columns only, listTrackedApps pulls full rows.
  const allApps = await db
    .select({ id: apps.id, store: apps.store, storeAppId: apps.storeAppId })
    .from(apps);
  const appleApps = allApps.filter((a) => a.store === "apple");
  const googleApps = allApps.filter((a) => a.store === "google");
  const unsupportedApps = allApps.filter((a) => !distributionStoreCapability(a.store)?.snapshotRefresh);
  console.log(
    `[snapshot-bulk] ${allApps.length} apps (` +
      `${appleApps.length} apple, ${googleApps.length} google, ${unsupportedApps.length} unsupported)`,
  );

  // 2) Chart-rank lookup once (US).
  console.log("[snapshot-bulk] fetching fresh chart ranks (US)…");
  const chartLookup = await fetchChartRankLookup("us");
  console.log(`  ${chartLookup.size} charted apps across Apple + Google\n`);

  let written = 0;
  let skipped = unsupportedApps.length;
  if (unsupportedApps.length > 0) {
    console.log(`[snapshot-bulk] unsupported Distribution stores skipped: ${unsupportedApps.length}`);
  }

  // 3) Apple apps in batches of 200, throttled to ~5 req/s.
  const appIdByStoreAppId = new Map(appleApps.map((a) => [a.storeAppId, a.id]));
  const totalBatches = Math.ceil(appleApps.length / BATCH_SIZE);
  console.log(`[snapshot-bulk] apple: ${totalBatches} batches of ${BATCH_SIZE}…`);

  let reqsPerSec = NORMAL_REQS_PER_SEC;
  let consecutiveFailures = 0;
  let stoppedEarly = false;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const slice = appleApps.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
    const batchStartedAt = Date.now();

    try {
      const metas = await lookupAppleApps(slice.map((a) => a.storeAppId));

      const seen = new Set<string>();
      for (const meta of metas) {
        const appId = appIdByStoreAppId.get(meta.storeAppId);
        if (!appId) continue; // lookup occasionally returns ids we didn't ask for
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
        written++;
      }

      skipped += slice.length - seen.size; // apps missing from the lookup response
      consecutiveFailures = 0;
    } catch (error) {
      skipped += slice.length;
      consecutiveFailures++;

      if (isRateLimitError(error)) {
        if (reqsPerSec !== SLOW_REQS_PER_SEC) {
          console.warn(`  rate-limited at batch ${batchIndex + 1} — slowing to ${SLOW_REQS_PER_SEC} req/s`);
          reqsPerSec = SLOW_REQS_PER_SEC;
        }
      } else {
        console.warn(`  batch ${batchIndex + 1}/${totalBatches} failed: ${(error as Error).message}`);
      }

      if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `  ${consecutiveFailures} consecutive batch failures — stopping gracefully at batch ${batchIndex + 1}/${totalBatches}`,
        );
        stoppedEarly = true;
        break;
      }
    }

    if ((batchIndex + 1) % LOG_EVERY_BATCHES === 0) {
      console.log(
        `  batch ${batchIndex + 1}/${totalBatches} — ${written} written, ${skipped} skipped (${sec(startedAt)}s)`,
      );
    }

    // Throttle: each batch issues REQUESTS_PER_BATCH HTTP requests back-to-back.
    const minBatchMs = (REQUESTS_PER_BATCH / reqsPerSec) * 1000;
    const elapsed = Date.now() - batchStartedAt;
    if (elapsed < minBatchMs) await sleep(minBatchMs - elapsed);
  }

  // 4) Google apps — per-app metadata fetch with 150ms sleep.
  if (!stoppedEarly) {
    console.log(`\n[snapshot-bulk] google: ${googleApps.length} apps…`);
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
        written++;
      } catch (error) {
        console.warn(`  skip ${app.id}: ${(error as Error).message}`);
        skipped++;
      }
      await sleep(150);
    }
  }

  console.log(
    `\n[snapshot-bulk] done in ${sec(startedAt)}s — ${allApps.length} apps, ` +
      `${written} snapshots written, ${skipped} skipped (${snapshotDate})` +
      (stoppedEarly ? " — STOPPED EARLY on consecutive failures" : "") +
      "\n",
  );
}

function sec(from: number): string {
  return ((Date.now() - from) / 1000).toFixed(0);
}

const isMain = process.argv[1]?.includes("snapshot-bulk");
if (isMain) {
  runSnapshotBulk()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[snapshot-bulk] fatal:", error);
      process.exit(1);
    });
}

#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { discoverAppIds, type DiscoveredApp } from "../apple/discover.js";
import { enrichAndPersistAppleApps } from "../apple/ingest-apps.js";
import { todaySnapshotDate } from "../util/dates.js";

const TARGET = Number(process.env.TARGET ?? 10_000);

export async function runBulkSeed(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();
  const startedAt = Date.now();

  console.log(`\n[bulk-seed] target=${TARGET}  snapshot=${snapshotDate}`);
  console.log(`[bulk-seed] DB = ${process.env.DATABASE_URL ?? "(default repo data/kittie.db)"}\n`);

  // 1) Discover unique Apple app IDs (popularity-ranked charts → search top-up).
  console.log("[bulk-seed] discovering app IDs…");
  let lastLogged = 0;
  const discovered: DiscoveredApp[] = await discoverAppIds({
    target: TARGET,
    onProgress: (n) => {
      if (n - lastLogged >= 500) {
        lastLogged = n;
        console.log(`  …${n} unique IDs`);
      }
    },
  });
  console.log(`[bulk-seed] discovered ${discovered.length} unique IDs in ${sec(startedAt)}s\n`);

  // 2) Enrich + upsert + snapshot-on-discover (shared pipeline).
  console.log("[bulk-seed] enriching metadata + writing to DB…");
  let lastUpsertLog = 0;
  const { upserted, failed } = await enrichAndPersistAppleApps(db, discovered, {
    snapshotDate,
    onProgress: (n) => {
      if (n - lastUpsertLog >= 500) {
        lastUpsertLog = n;
        console.log(`  …upserted ${n}/${discovered.length}`);
      }
    },
  });

  console.log(
    `\n[bulk-seed] done in ${sec(startedAt)}s — upserted ${upserted} apps` +
      (failed ? `, ${failed} ids failed lookup` : "") +
      ` for snapshot ${snapshotDate}.\n`,
  );
}

function sec(from: number): string {
  return ((Date.now() - from) / 1000).toFixed(0);
}

runBulkSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[bulk-seed] fatal:", err);
    process.exit(1);
  });

#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { discoverAppIds, type DiscoveredApp } from "../apple/discover.js";
import { enrichAndPersistAppleApps } from "../apple/ingest-apps.js";
import { todaySnapshotDate } from "../util/dates.js";

/** Apps discovered + enriched per run. Kept modest to stay polite to the free
 *  Apple endpoints and avoid rate-limit bans; the catalog grows run-over-run. */
const DEFAULT_CAP = 500;

export interface AppleDiscoverResult {
  discovered: number;
  upserted: number;
  snapshotted: number;
  failed: number;
}

/**
 * Free Apple discovery collector — US only.
 *
 * Apple offers no free "new releases" feed, so we discover broadly via the
 * popularity-ranked genre charts + search top-up, then enrich and snapshot each
 * app on discovery. Freshness is derived downstream from the guarded
 * `releasedAt` (≤ 7d) — that is what fills the New Big Hits highlights widget.
 * See docs/adr/0006-apple-discovery-by-popularity.md.
 */
export async function runAppleDiscover(
  cap: number = Number(process.env.APPLE_DISCOVER_CAP ?? DEFAULT_CAP),
): Promise<AppleDiscoverResult> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();
  const startedAt = Date.now();

  console.log(`\n[apple-discover] cap=${cap}  region=US  snapshot=${snapshotDate}`);
  console.log(`[apple-discover] DB = ${process.env.DATABASE_URL ?? "(default repo data/kittie.db)"}\n`);

  // 1) Discover US app IDs (charts → search top-up), bounded by the cap.
  let lastLogged = 0;
  const discovered: DiscoveredApp[] = await discoverAppIds({
    target: cap,
    countries: ["us"],
    onProgress: (n) => {
      if (n - lastLogged >= 100) {
        lastLogged = n;
        console.log(`  …${n} unique IDs`);
      }
    },
  });
  console.log(`[apple-discover] discovered ${discovered.length} US app IDs in ${sec(startedAt)}s`);

  // 2) Enrich + upsert + snapshot-on-discover (shared pipeline).
  const { upserted, snapshotted, failed } = await enrichAndPersistAppleApps(db, discovered, {
    snapshotDate,
  });

  console.log(
    `\n[apple-discover] done in ${sec(startedAt)}s — discovered ${discovered.length}, ` +
      `upserted ${upserted}, snapshotted ${snapshotted}` +
      (failed ? `, ${failed} ids failed lookup` : "") +
      "\n",
  );

  return { discovered: discovered.length, upserted, snapshotted, failed };
}

function sec(from: number): string {
  return ((Date.now() - from) / 1000).toFixed(0);
}

const isMain = process.argv[1]?.includes("apple-discover");
if (isMain) {
  runAppleDiscover()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[apple-discover] fatal:", err);
      process.exit(1);
    });
}

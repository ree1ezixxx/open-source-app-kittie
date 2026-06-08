#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { discoverAppIds, type DiscoveredApp } from "../apple/discover.js";
import { lookupAppleApps } from "../apple/lookup.js";
import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

const TARGET = Number(process.env.TARGET ?? 10_000);
const ENRICH_BATCH = 50; // iTunes lookup hard cap is ~200; lookup.ts already chunks at 50

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
  const hintById = new Map(discovered.map((d) => [d.storeAppId, d]));
  const ids = discovered.map((d) => d.storeAppId);
  console.log(`[bulk-seed] discovered ${ids.length} unique IDs in ${sec(startedAt)}s\n`);

  // 2) Enrich + upsert in batches.
  console.log("[bulk-seed] enriching metadata + writing to DB…");
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += ENRICH_BATCH) {
    const slice = ids.slice(i, i + ENRICH_BATCH);
    let metas;
    try {
      metas = await lookupAppleApps(slice);
    } catch (err) {
      failed += slice.length;
      console.warn(`  lookup batch @${i} failed: ${(err as Error).message} — backing off`);
      await sleep(1500);
      continue;
    }

    for (const meta of metas) {
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

      const hint = hintById.get(meta.storeAppId);
      await upsertSnapshot(db, {
        appId,
        snapshotDate,
        reviewCount: meta.reviewCount,
        rating: meta.rating,
        chartRank: hint?.chartRank ?? null,
        chartCategory: hint?.chartCategory ?? null,
        chartCountry: hint?.chartCountry ?? "US",
      });
      upserted++;
    }

    if (upserted - (upserted % 500) > 0 && (i / ENRICH_BATCH) % 10 === 0) {
      console.log(`  …upserted ${upserted}/${ids.length}`);
    }
    await sleep(120);
  }

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

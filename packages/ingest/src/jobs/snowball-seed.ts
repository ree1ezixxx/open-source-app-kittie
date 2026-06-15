#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb, apps } from "@kittie/db";
import { eq } from "drizzle-orm";

import { lookupAppleApps, lookupDeveloperApps, type AppleLookupResult } from "../apple/lookup.js";
import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

/**
 * Snowball discovery via developer fan-out.
 *
 * Charts + search only surface a popularity-biased slice (we drained out at ~9.6K).
 * Every app exposes its `artistId`; `lookup?id=<artistId>&entity=software` returns that
 * developer's ENTIRE catalog. So: take the developers already in our DB and fan each one
 * out to all their apps. One pass typically multiplies the catalog several-fold.
 * Idempotent — upserts, skips apps already present.
 */

const TARGET = Number(process.env.TARGET ?? 100_000);
const CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 5;
const SLEEP = process.env.SLEEP ? Number(process.env.SLEEP) : 120;
const LOOKUP_BATCH = 50;

async function persist(db: ReturnType<typeof createDb>, meta: AppleLookupResult, snapshotDate: string): Promise<void> {
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
    chartRank: null,
    chartCategory: null,
    chartCountry: "US",
  });
}

export async function runSnowballSeed(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();
  const startedAt = Date.now();

  console.log(`\n[snowball] target=${TARGET}  DB=${process.env.DATABASE_URL ?? "(default)"}`);

  const seen = new Set<string>();
  const seedRows = await db.select({ storeAppId: apps.storeAppId }).from(apps).where(eq(apps.store, "apple"));
  for (const r of seedRows) seen.add(r.storeAppId);
  console.log(`[snowball] seed = ${seen.size} apple apps`);

  // 1) Bootstrap: resolve the seed apps' developers (artistId).
  const seedIds = [...seen];
  const artists = new Set<string>();
  for (let i = 0; i < seedIds.length; i += LOOKUP_BATCH) {
    try {
      for (const m of await lookupAppleApps(seedIds.slice(i, i + LOOKUP_BATCH))) {
        if (m.artistId) artists.add(m.artistId);
      }
    } catch {
      /* tolerate a bad batch */
    }
    if ((i / LOOKUP_BATCH) % 20 === 0) console.log(`  …resolved developers from ${i}/${seedIds.length} seed apps · ${artists.size} devs`);
    await sleep(SLEEP);
  }
  console.log(`[snowball] ${artists.size} unique developers to fan out\n`);

  // 2) Fan out: expand each developer to their full catalog.
  const frontier = [...artists];
  let cursor = 0;
  let added = 0;
  let reachedTarget = false;

  async function worker(): Promise<void> {
    while (cursor < frontier.length && !reachedTarget) {
      const artistId = frontier[cursor++]!;
      try {
        for (const meta of await lookupDeveloperApps(artistId)) {
          if (seen.has(meta.storeAppId)) continue;
          seen.add(meta.storeAppId);
          await persist(db, meta, snapshotDate);
          if (++added % 250 === 0) {
            console.log(`  …+${added} new · total ${seen.size} · dev ${cursor}/${frontier.length}`);
          }
          if (seen.size >= TARGET) {
            reachedTarget = true;
            break;
          }
        }
      } catch {
        /* skip failed developer */
      }
      await sleep(SLEEP);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    `\n[snowball] done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s — ` +
      `+${added} new apps, catalog now ${seen.size}${reachedTarget ? " (hit target)" : " (developers exhausted)"}.\n`,
  );
}

runSnowballSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[snowball] fatal:", err);
    process.exit(1);
  });

#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb, apps } from "@kittie/db";
import { eq } from "drizzle-orm";

import { lookupAppleApps, type AppleLookupResult } from "../apple/lookup.js";
import { scrapeRelatedAppIds } from "../apple/scrape.js";
import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

/**
 * Snowball discovery via related-apps fan-out.
 *
 * Developer fan-out (jobs/snowball-seed.ts) is one-pass — it can only reach apps by
 * developers we already know, and drains out fast (~1.3 apps/dev). The compounding lever
 * is the App Store web listing: every app's page links ~10-30 OTHER apps ("You Might Also
 * Like" / "More By This Developer"), many by developers we've NEVER seen. Crawl those,
 * add the new apps, and THEIR pages surface more — the catalog snowballs.
 *
 * Round-based BFS: scrape a batch of known apps for related IDs, look up + persist the new
 * ones, then those new apps seed the next round. Idempotent (upserts, skips known IDs),
 * target-bounded (stops at TARGET), resumable (re-running picks up from the current DB).
 */

const TARGET = Number(process.env.TARGET ?? 100_000);
const SCRAPE_CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 6;
const SLEEP = process.env.SLEEP ? Number(process.env.SLEEP) : 150;
const CRAWL_PER_ROUND = process.env.ROUND ? Number(process.env.ROUND) : 1500;
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

export async function runRelatedCrawl(): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();
  const startedAt = Date.now();

  console.log(`\n[related] target=${TARGET}  DB=${process.env.DATABASE_URL ?? "(default)"}`);

  // Everything we already know — never re-add, never re-crawl.
  const seen = new Set<string>();
  const seedRows = await db.select({ storeAppId: apps.storeAppId }).from(apps).where(eq(apps.store, "apple"));
  for (const r of seedRows) seen.add(r.storeAppId);
  console.log(`[related] seed = ${seen.size} apple apps`);

  const frontier = [...seen]; // app IDs whose pages we still need to scrape (grows as we add apps)
  let cursor = 0;
  let added = 0;
  let round = 0;

  while (seen.size < TARGET && cursor < frontier.length) {
    round++;
    const batch = frontier.slice(cursor, cursor + CRAWL_PER_ROUND);
    cursor += batch.length;

    // 1) Scrape this round's pages for related app IDs (concurrent pool, gentle pacing).
    const candidates = new Set<string>();
    let bi = 0;
    async function scraper(): Promise<void> {
      while (bi < batch.length && seen.size < TARGET) {
        const id = batch[bi++]!;
        try {
          for (const rel of await scrapeRelatedAppIds(id)) {
            if (!seen.has(rel)) candidates.add(rel);
          }
        } catch {
          /* stripped page / network — skip */
        }
        await sleep(SLEEP);
      }
    }
    await Promise.all(Array.from({ length: SCRAPE_CONCURRENCY }, () => scraper()));

    // 2) Look up + persist the new IDs in batches; each becomes fuel for a later round.
    const newIds = [...candidates];
    let roundAdded = 0;
    for (let i = 0; i < newIds.length && seen.size < TARGET; i += LOOKUP_BATCH) {
      try {
        for (const meta of await lookupAppleApps(newIds.slice(i, i + LOOKUP_BATCH))) {
          if (seen.has(meta.storeAppId)) continue;
          seen.add(meta.storeAppId);
          await persist(db, meta, snapshotDate);
          frontier.push(meta.storeAppId);
          added++;
          roundAdded++;
          if (seen.size >= TARGET) break;
        }
      } catch {
        /* tolerate a bad lookup batch */
      }
      await sleep(SLEEP);
    }

    console.log(
      `  round ${round}: crawled ${batch.length} pages · +${roundAdded} new · ` +
        `total ${seen.size} · frontier ${frontier.length} (cursor ${cursor})`,
    );
  }

  const why = seen.size >= TARGET ? "hit target" : "frontier exhausted";
  console.log(
    `\n[related] done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s — ` +
      `+${added} new apps over ${round} rounds, catalog now ${seen.size} (${why}).\n`,
  );
}

runRelatedCrawl()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[related] fatal:", err);
    process.exit(1);
  });

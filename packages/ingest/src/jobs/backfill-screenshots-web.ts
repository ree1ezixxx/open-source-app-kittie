#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb, apps } from "@kittie/db";
import { and, eq, isNull, or } from "drizzle-orm";

import { scrapeAppStoreScreenshots } from "../apple/scrape.js";
import { makeAppId } from "../util/ids.js";
import { sleep } from "../util/rate-limit.js";

/**
 * Backfill screenshots from the App Store web listing for Apple apps that the
 * iTunes API returns none for. Writes ONLY the screenshot column. Idempotent:
 * re-running only revisits apps still empty. Tune with LIMIT / CONCURRENCY env.
 */

const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 5;
const SLEEP = process.env.SLEEP ? Number(process.env.SLEEP) : 120;

export async function runBackfillScreenshotsWeb(): Promise<void> {
  loadEnv();
  const db = createDb();
  const startedAt = Date.now();

  console.log(`\n[ss-web] DB = ${process.env.DATABASE_URL ?? "(default repo data/kittie.db)"}`);

  const missing = await db
    .select({ storeAppId: apps.storeAppId })
    .from(apps)
    .where(
      and(
        eq(apps.store, "apple"),
        or(isNull(apps.screenshotUrls), eq(apps.screenshotUrls, ""), eq(apps.screenshotUrls, "[]")),
      ),
    );

  const ids = missing.map((m) => m.storeAppId).slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
  console.log(`[ss-web] ${missing.length} apple apps missing screenshots; processing ${ids.length} @ ${CONCURRENCY}x\n`);

  let filled = 0;
  let empty = 0;
  let failed = 0;
  let done = 0;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const storeAppId = ids[cursor++]!;
      try {
        const shots = await scrapeAppStoreScreenshots(storeAppId);
        if (shots.length > 0) {
          await db
            .update(apps)
            .set({ screenshotUrls: JSON.stringify(shots), lastIngestedAt: new Date() })
            .where(eq(apps.id, makeAppId("apple", storeAppId)));
          filled++;
        } else {
          empty++;
        }
      } catch {
        failed++;
      }
      if (++done % 100 === 0) {
        console.log(`  …${done}/${ids.length} · ${filled} filled · ${empty} none · ${failed} failed`);
      }
      await sleep(SLEEP);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    `\n[ss-web] done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s — ` +
      `filled ${filled}, none ${empty}, failed ${failed} of ${ids.length}.\n`,
  );
}

runBackfillScreenshotsWeb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ss-web] fatal:", err);
    process.exit(1);
  });

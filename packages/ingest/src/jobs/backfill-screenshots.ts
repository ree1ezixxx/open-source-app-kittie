#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb, apps } from "@kittie/db";
import { and, eq, isNull, or } from "drizzle-orm";

import { lookupAppleApps } from "../apple/lookup.js";
import { makeAppId } from "../util/ids.js";
import { sleep } from "../util/rate-limit.js";

/**
 * Backfill App Store screenshots for Apple apps that have none.
 *
 * ~36% of bulk-seeded apps ended up with empty screenshot_urls because Apple's
 * batched lookup occasionally omits records from a 50-id request. This re-looks
 * them up and writes ONLY the screenshot column — no other field is touched, so
 * it can't clobber existing data. Idempotent: re-running only revisits apps that
 * are still empty.
 */

const BATCH = 50;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

export async function runBackfillScreenshots(): Promise<void> {
  loadEnv();
  const db = createDb();
  const startedAt = Date.now();

  console.log(`\n[backfill-screenshots] DB = ${process.env.DATABASE_URL ?? "(default repo data/kittie.db)"}`);

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
  console.log(`[backfill-screenshots] ${missing.length} apple apps missing screenshots; processing ${ids.length}\n`);

  let filled = 0;
  let stillEmpty = 0;
  let notReturned = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    let metas;
    try {
      metas = await lookupAppleApps(slice);
    } catch (err) {
      console.warn(`  lookup batch @${i} failed: ${(err as Error).message} — backing off`);
      await sleep(1500);
      continue;
    }

    const returned = new Set<string>();
    for (const meta of metas) {
      returned.add(meta.storeAppId);
      if (meta.screenshotUrls.length === 0) {
        stillEmpty++;
        continue;
      }
      await db
        .update(apps)
        .set({ screenshotUrls: JSON.stringify(meta.screenshotUrls), lastIngestedAt: new Date() })
        .where(eq(apps.id, makeAppId("apple", meta.storeAppId)));
      filled++;
    }
    notReturned += slice.filter((id) => !returned.has(id)).length;

    if ((i / BATCH) % 10 === 0) {
      console.log(`  …${i + slice.length}/${ids.length} scanned · ${filled} filled`);
    }
    await sleep(150);
  }

  console.log(
    `\n[backfill-screenshots] done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s — ` +
      `filled ${filled}, Apple has none for ${stillEmpty}, not returned ${notReturned}.\n`,
  );
}

runBackfillScreenshots()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-screenshots] fatal:", err);
    process.exit(1);
  });

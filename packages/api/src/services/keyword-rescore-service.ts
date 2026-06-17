import { listStaleCatalogKeywords, listStaleTrackedKeywords } from "@kittie/db";

import { getDb } from "../lib/db.js";
import { getKeywordDifficulty } from "./keyword-service.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Per-run cap on catalog re-syncs — paced so the whole catalog cycles over a
 *  few days without hammering the stores. Env-tunable as the catalog grows. */
const CATALOG_REFRESH_LIMIT = Number(process.env.KEYWORD_REFRESH_LIMIT ?? 300);

/**
 * Re-score sweep for Tracked keywords (>7d stale). Feeding each through the
 * normal lookup path is enough: the 7-day TTL sees the stale row and
 * refetches + upserts. Paced sequentially — a shortlist is small, the stores
 * are not ours to hammer.
 */
export async function sweepStaleTrackedKeywords(): Promise<{ stale: number; rescored: number }> {
  const stale = await listStaleTrackedKeywords(getDb(), 7);
  let rescored = 0;
  for (const { keyword, country, store } of stale) {
    try {
      await getKeywordDifficulty(keyword, country, store);
      rescored++;
    } catch {
      /* one keyword failing must not abort the sweep */
    }
    await sleep(400);
  }
  return { stale: stale.length, rescored };
}

/**
 * Catalog-wide freshness sweep: re-sync the oldest stale keywords (>7d),
 * tracked or not, so even keywords nobody has viewed stay current. Feeds each
 * through the lookup path (stale TTL → live refetch + upsert), capped + paced
 * per run so it cycles the catalog over a few days, store-friendly.
 */
export async function sweepStaleCatalogKeywords(): Promise<{ stale: number; rescored: number }> {
  const stale = await listStaleCatalogKeywords(getDb(), 7, CATALOG_REFRESH_LIMIT);
  let rescored = 0;
  for (const { keyword, country, store } of stale) {
    try {
      await getKeywordDifficulty(keyword, country, store);
      rescored++;
    } catch {
      /* one keyword failing must not abort the sweep */
    }
    await sleep(400);
  }
  return { stale: stale.length, rescored };
}

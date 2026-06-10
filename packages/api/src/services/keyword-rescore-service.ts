import { listStaleTrackedKeywords } from "@kittie/db";

import { getDb } from "../lib/db.js";
import { getKeywordDifficulty } from "./keyword-service.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

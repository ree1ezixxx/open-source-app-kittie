import { listFreshSet } from "@kittie/db";

import { getDb } from "../lib/db.js";
import { syncAppReviews } from "./review-sync-service.js";

/* ============================================================
   Continuous-refresh sweep — keeps the FRESH SET live.

   Fresh set = every App that already has ≥1 indexed Review. Membership
   follows ingestion history, NOT monitoring (monitoring is a client-side
   bookmark with no server identity). This is how review data stays live
   without any auth backend.

   Runs in-process: a catch-up sweep on API boot + an interval while the API
   is up. Free; the only ceiling is store rate-limiting, so it's PACED (a gap
   between apps, stale-first, capped per run) and each per-app sync is a delta
   (the upsert only adds reviews newer than what's stored).
   ============================================================ */

export interface SweepOptions {
  /** Skip apps refreshed within this window (hours). */
  staleHours?: number;
  /** Max apps to touch in one sweep — politeness cap. */
  maxApps?: number;
  /** Gap between per-app syncs (ms). */
  gapMs?: number;
}

export interface SweepResult {
  scanned: number;
  refreshed: number;
  newReviews: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One pass over the stale tail of the fresh set. Safe to call repeatedly. */
export async function sweepFreshSet(opts: SweepOptions = {}): Promise<SweepResult> {
  const staleHours = opts.staleHours ?? 24;
  const maxApps = opts.maxApps ?? 25;
  const gapMs = opts.gapMs ?? 800;

  // Fresh set with latest ingest time per app (epoch seconds), oldest first.
  const rows = await listFreshSet(getDb());

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = staleHours * 3600;
  const stale = rows.filter((r) => nowSec - (r.lastIngest ?? 0) >= cutoff).slice(0, maxApps);

  let refreshed = 0;
  let newReviews = 0;
  for (const r of stale) {
    try {
      const res = await syncAppReviews(r.appId);
      if (res) {
        refreshed++;
        newReviews += res.synced;
      }
    } catch {
      /* one app failing must not abort the sweep */
    }
    await sleep(gapMs);
  }

  return { scanned: rows.length, refreshed, newReviews };
}

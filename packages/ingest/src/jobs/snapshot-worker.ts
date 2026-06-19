#!/usr/bin/env node
/**
 * Out-of-process snapshot worker (ADR 0008).
 *
 * A separate OS process from the API. It loops `runSnapshotDue` forever: drain
 * the hot tier daily, chip the cold tier within a per-cycle budget, pace between
 * cycles. Because each cycle is resumable from DB state, a crash/OOM here is
 * harmless — the supervisor (scripts/run-worker.sh) restarts it and it picks up
 * the still-due set. Critically, an OOM kills THIS process, never the API.
 *
 * Tunables (env): WORKER_COLD_BATCH, WORKER_COLD_WINDOW_DAYS, WORKER_CYCLE_GAP_MS.
 * WORKER_ONCE=1 runs a single cycle then exits (bounded verification).
 */
import { loadEnv } from "@kittie/core";

import { runSnapshotDue } from "./snapshot-due.js";
import { sleep } from "../util/rate-limit.js";

const COLD_BATCH = Number(process.env.WORKER_COLD_BATCH ?? 2000);
const COLD_WINDOW_DAYS = Number(process.env.WORKER_COLD_WINDOW_DAYS ?? 7);
const CYCLE_GAP_MS = Number(process.env.WORKER_CYCLE_GAP_MS ?? 60_000);
const HOT_CAP = Number(process.env.WORKER_HOT_CAP ?? 20_000);
const ONCE = process.env.WORKER_ONCE === "1";

async function main(): Promise<void> {
  loadEnv();
  console.log(
    `[snapshot-worker] up — coldBatch=${COLD_BATCH} window=${COLD_WINDOW_DAYS}d ` +
      `gap=${CYCLE_GAP_MS}ms${ONCE ? " once=1" : ""}`,
  );

  for (;;) {
    try {
      const r = await runSnapshotDue({
        coldBatch: COLD_BATCH,
        coldWindowDays: COLD_WINDOW_DAYS,
        hotCap: HOT_CAP,
      });
      console.log(
        `[snapshot-worker] ${r.snapshotDate}: ${r.written} written, ${r.skipped} skipped — ` +
          `hotDue=${r.hotDue} coldDue=${r.coldDue} (${(r.ms / 1000).toFixed(0)}s, ` +
          `rss=${(process.memoryUsage().rss / 1e6).toFixed(0)}MB)`,
      );
    } catch (e) {
      // Never let a cycle crash the loop — it retries next tick from DB state.
      console.error("[snapshot-worker] cycle failed:", e instanceof Error ? e.message : e);
    }
    if (ONCE) break;
    await sleep(CYCLE_GAP_MS);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[snapshot-worker] fatal:", e);
    process.exit(1);
  });

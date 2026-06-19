#!/usr/bin/env node
/**
 * Out-of-process snapshot worker (ADR 0008).
 *
 * A separate OS process from the API. Each loop it (1) captures the day's chart
 * leaderboards once per UTC day — a coherent Top-N set so the Trending 24h
 * rank-delta works (chart-capture.ts) — then (2) runs `runSnapshotDue` to keep
 * the hot tier's metrics fresh and chip the cold tier within a per-cycle budget.
 * Because each cycle is resumable from DB state, a crash/OOM here is harmless —
 * the supervisor (scripts/run-worker.sh) restarts it and it picks up the still-due
 * set. Critically, an OOM kills THIS process, never the API.
 *
 * Tunables (env): WORKER_COLD_BATCH, WORKER_COLD_WINDOW_DAYS, WORKER_CYCLE_GAP_MS,
 * WORKER_HOT_CAP, WORKER_CHART_COUNTRIES (CSV, default "US").
 * WORKER_ONCE=1 runs a single cycle (capture + metrics) then exits.
 */
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { captureChartRanks } from "./chart-capture.js";
import { carryForwardSnapshots } from "./carry-forward.js";
import { runSnapshotDue } from "./snapshot-due.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

/** Parse a numeric env tunable, falling back to the default on NaN/non-numeric. */
function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const COLD_BATCH = num(process.env.WORKER_COLD_BATCH, 2000);
const COLD_WINDOW_DAYS = num(process.env.WORKER_COLD_WINDOW_DAYS, 7);
const CYCLE_GAP_MS = num(process.env.WORKER_CYCLE_GAP_MS, 60_000);
const HOT_CAP = num(process.env.WORKER_HOT_CAP, 20_000);
const CHART_COUNTRIES = (process.env.WORKER_CHART_COUNTRIES ?? "US")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ONCE = process.env.WORKER_ONCE === "1";

async function main(): Promise<void> {
  loadEnv();
  const db = createDb();
  console.log(
    `[snapshot-worker] up — coldBatch=${COLD_BATCH} window=${COLD_WINDOW_DAYS}d ` +
      `gap=${CYCLE_GAP_MS}ms charts=[${CHART_COUNTRIES.join(",")}]${ONCE ? " once=1" : ""}`,
  );

  let lastDailyDay = "";
  for (;;) {
    const today = todaySnapshotDate();

    // (1) Once-per-UTC-day setup. Both steps are idempotent, so a restart re-running
    // them is harmless.
    if (today !== lastDailyDay) {
      // (1a) Carry-forward FIRST: make today's snapshot day FULL (copy each app's
      // latest metrics in-DB) so Explore's global-max-date pin shows the whole
      // catalog, not just the few-k apps refreshed since midnight.
      try {
        const cf = await carryForwardSnapshots(db, { snapshotDate: today, countries: CHART_COUNTRIES });
        console.log(`[snapshot-worker] carry-forward ${today}: ${cf.carried} rows (${(cf.ms / 1000).toFixed(0)}s)`);
      } catch (e) {
        console.error("[snapshot-worker] carry-forward failed:", e instanceof Error ? e.message : e);
      }

      // (1b) Coherent chart capture (matches truth's periodic snapshot).
      try {
        const cap = await captureChartRanks(db, { countries: CHART_COUNTRIES, snapshotDate: today });
        console.log(
          `[snapshot-worker] chart capture ${today}: ${cap.written} ranks across ` +
            `[${cap.countries.join(",")}]${cap.failed.length ? ` (failed: ${cap.failed.join(",")})` : ""}, ` +
            `${cap.denormalized} denormalized (${(cap.ms / 1000).toFixed(0)}s)`,
        );
        // Only mark the day done if a country succeeded, so a total feed outage
        // retries next cycle instead of leaving the day half-set-up.
        if (cap.countries.length > 0) lastDailyDay = today;
      } catch (e) {
        console.error("[snapshot-worker] chart capture failed:", e instanceof Error ? e.message : e);
      }
    }

    // (2) Metric refresh pass (chart-free).
    try {
      const r = await runSnapshotDue({
        coldBatch: COLD_BATCH,
        coldWindowDays: COLD_WINDOW_DAYS,
        hotCap: HOT_CAP,
        db,
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

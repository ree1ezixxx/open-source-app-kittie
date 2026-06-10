/* ============================================================
   CI sweep runner: register every sweep, run the due ones ONCE,
   print their summaries, exit. GitHub Actions invokes this on a
   cron against the hosted Turso DB — `sweep_state` persists
   last-run times there, so cadences hold across runs exactly as
   they do for the long-lived local API process.
   ============================================================ */
import { loadEnv } from "@kittie/core";
import { freshnessStatus, tick } from "../services/freshness-service.js";
import { registerAllSweeps } from "../sweeps.js";

loadEnv();

if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
  console.warn("[run-sweeps-once] no TURSO_DATABASE_URL/DATABASE_URL set — using the local file DB");
}

registerAllSweeps();

const startedAt = Date.now();
await tick();

const { sweeps } = await freshnessStatus();
for (const s of sweeps) {
  console.log(`[${s.name}] last=${s.lastRunAt ?? "never"} :: ${s.lastSummary ?? "—"}`);
}
console.log(`[run-sweeps-once] done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
process.exit(0);

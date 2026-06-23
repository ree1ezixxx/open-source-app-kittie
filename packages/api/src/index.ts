import { serve } from "@hono/node-server";
import { loadEnv } from "@kittie/core";
import { ensureAppsFts } from "@kittie/db";
import { createApp } from "./app.js";
import { getDb } from "./lib/db.js";
import { installPreviewShutdownHooks, startPreviewReaper } from "./lib/preview.js";
import { startRunEventSweeper } from "./lib/run-events.js";
import { startFreshness } from "./services/freshness-service.js";
import { warmLandingReadCaches } from "./services/warm-cache.js";
import { registerAllSweeps } from "./sweeps.js";
import { seedAppEngine } from "./scripts/seed-app-engine.js";

const env = loadEnv();
const app = createApp();

registerAllSweeps();

// Seed cloneable apps on startup if not already seeded
seedAppEngine().catch((e) => {
  console.warn("Failed to seed app engine:", e instanceof Error ? e.message : e);
});

// Ensure the app-search FTS index + sync triggers exist (backfills once if empty).
ensureAppsFts(getDb()).catch((e) => {
  console.warn("Failed to init apps_fts:", e instanceof Error ? e.message : e);
});

startPreviewReaper();
installPreviewShutdownHooks();
startRunEventSweeper();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kittie API listening on http://localhost:${info.port}`);
  warmLandingReadCaches();
  // Background freshness sweeps run only on the single designated writer. Booting
  // with RUN_SWEEPS=0 serves reads WITHOUT the snapshot-bulk boot catch-up, which
  // materialises the full catalog and OOMs the heap (see boot-catchup memory +
  // the per-country ingest handoff). Default stays on so the writer is unaffected.
  if (process.env.RUN_SWEEPS === "0") {
    console.log("RUN_SWEEPS=0 → freshness sweeps disabled (read-only serving).");
  } else {
    startFreshness();
  }
});

export { createApp };

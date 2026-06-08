import { serve } from "@hono/node-server";
import { loadEnv } from "@kittie/core";
import { createApp } from "./app.js";
import { sweepFreshSet } from "./services/review-sweep-service.js";

const env = loadEnv();
const app = createApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kittie API listening on http://localhost:${info.port}`);
  startContinuousRefresh();
});

/**
 * In-process continuous refresh. No hosted server / OS cron: a catch-up sweep
 * shortly after boot, then an interval while the API is up. Naps when the
 * process is down; catches up on next start. Paced + delta inside the sweep.
 */
function startContinuousRefresh(): void {
  const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h while up
  const runSweep = () => {
    void sweepFreshSet()
      .then((r) => {
        if (r.refreshed > 0 || r.newReviews > 0) {
          console.log(`[sweep] refreshed ${r.refreshed}/${r.scanned} apps, +${r.newReviews} reviews`);
        }
      })
      .catch((e) => console.warn("[sweep] failed:", e instanceof Error ? e.message : e));
  };
  // Delay the boot sweep so server startup isn't competing with network I/O.
  setTimeout(runSweep, 15_000);
  setInterval(runSweep, SWEEP_INTERVAL_MS);
}

export { createApp };

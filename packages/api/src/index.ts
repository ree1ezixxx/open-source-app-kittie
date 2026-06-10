import { serve } from "@hono/node-server";
import { loadEnv } from "@kittie/core";
import { runGoogleExpand, runScore, runSnapshotBulk } from "@kittie/ingest";
import { createApp } from "./app.js";
import { registerSweep, startFreshness } from "./services/freshness-service.js";
import { sweepHotIdeas } from "./services/idea-sweep-service.js";
import { sweepFreshSet } from "./services/review-sweep-service.js";

const env = loadEnv();
const app = createApp();

/* Freshness scheduler (ADR 0004): every derived dataset registers here.
   Sweeps run serialized in registration order — fastest-cadence first so a
   long daily sweep never starves the cheap delta sweeps at boot. */

registerSweep({
  name: "reviews-delta",
  cadenceHours: 6,
  async run() {
    const r = await sweepFreshSet();
    return `refreshed ${r.refreshed}/${r.scanned} apps, +${r.newReviews} reviews`;
  },
});

registerSweep({
  name: "snapshots-daily",
  cadenceHours: 24,
  async run() {
    // CONTEXT.md "Daily cadence": snapshot then score, once per calendar day.
    // snapshot-bulk also captures chart ranks; same-day reruns overwrite.
    await runSnapshotBulk();
    await runScore();
    return "snapshots + chart ranks + scores refreshed";
  },
});

registerSweep({
  name: "keyword-rescore",
  cadenceHours: 24,
  async run() {
    const { sweepStaleTrackedKeywords } = await import("./services/keyword-rescore-service.js");
    const r = await sweepStaleTrackedKeywords();
    return `re-scored ${r.rescored}/${r.stale} stale tracked keywords`;
  },
});

registerSweep({
  name: "hot-ideas",
  cadenceHours: 6,
  async run() {
    const r = await sweepHotIdeas();
    return `${r.existing}/${r.target} ideas (+${r.generated} this run, ${r.failed} failed)`;
  },
});

// Registered LAST (post-parity priority): grows Google coverage to ~5K apps
// in paced slices, then becomes a no-op once the target is reached.
registerSweep({
  name: "google-expand",
  cadenceHours: 24,
  async run() {
    const r = await runGoogleExpand();
    return `${r.totalGoogle}/${r.target} google apps (+${r.added} this run)`;
  },
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kittie API listening on http://localhost:${info.port}`);
  startFreshness();
});

export { createApp };

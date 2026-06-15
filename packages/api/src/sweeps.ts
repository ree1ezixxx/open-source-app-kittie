import { runGoogleExpand, runScore, runSnapshotBulk, syncOrganic } from "@kittie/ingest";
import { getDb } from "./lib/db.js";
import { registerSweep } from "./services/freshness-service.js";
import { sweepHotIdeas } from "./services/idea-sweep-service.js";
import { sweepFreshSet } from "./services/review-sweep-service.js";

/* Freshness scheduler (ADR 0004): every derived dataset registers here.
   Sweeps run serialized in registration order — fastest-cadence first so a
   long daily sweep never starves the cheap delta sweeps at boot.
   Shared by the long-lived API process AND the run-once CI runner; the
   sweep_state table keeps cadences honest across both. */

export function registerAllSweeps(): void {
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

  // Organic creator videos: same live seam as the Refresh button, on a cadence
  // so the surface stays current without a manual press. The source adapter is
  // stubbed today (representative rows), but boot catch-up + this cadence mean
  // the day a real feed is wired, the page tracks it automatically.
  registerSweep({
    name: "organic-videos",
    cadenceHours: 12,
    async run() {
      const r = await syncOrganic(getDb());
      return `refreshed ${r.videos} videos across ${r.apps} apps`;
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
}

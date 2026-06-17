import { runAppleDiscover, runGoogleExpand, runScore, runSnapshotBulk } from "@kittie/ingest";
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

  // Registered before snapshots-daily so newly-discovered apps are picked up by
  // the same-day snapshot+score pass (which overwrites the discovery chart-rank
  // hint with a fresher chart-lookup rank). No free Apple new-releases feed
  // exists (ADR 0006): discover broadly, filter by releasedAt downstream.
  registerSweep({
    name: "apple-discover",
    cadenceHours: 24,
    async run() {
      const r = await runAppleDiscover();
      return `discovered ${r.discovered}, upserted ${r.upserted}, snapshotted ${r.snapshotted}` +
        (r.failed ? `, ${r.failed} failed lookup` : "");
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

  // Catalog-wide keyword freshness: re-sync the oldest stale keywords each day
  // (capped/paced) so even un-viewed, un-tracked keywords stay current — the
  // seeded catalog never silently rots. Rides the same scheduler as the rest.
  registerSweep({
    name: "keyword-catalog-refresh",
    cadenceHours: 24,
    async run() {
      const { sweepStaleCatalogKeywords } = await import("./services/keyword-rescore-service.js");
      const r = await sweepStaleCatalogKeywords();
      return `re-synced ${r.rescored}/${r.stale} stale catalog keywords`;
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
}

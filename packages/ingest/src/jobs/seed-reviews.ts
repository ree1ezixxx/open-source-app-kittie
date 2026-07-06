#!/usr/bin/env node
/**
 * Category corpus seeding sweep (#270) — gives the decision ladder a real
 * review corpus. The continuous sweep (`sweepFreshSet`) only refreshes apps
 * that ALREADY have ≥1 review; nothing ever seeded new apps, which is why the
 * corpus sat at one app. This job resolves the top charting apps per category
 * and pulls their reviews through the existing live sync path (classified +
 * upserted) — after which the continuous sweep keeps them live.
 *
 * Idempotent + resumable: apps that already hold reviews are skipped, so a
 * re-run is a cheap no-op and an interrupted run continues where it stopped.
 * Politeness: paced gap between apps, per-run app cap. Logs counts, never
 * payloads.
 *
 * Usage:
 *   pnpm ingest:seed-reviews                       # default category set, US, apple
 *   pnpm ingest:seed-reviews -- --categories "Education,Finance" --top 25 \
 *       --max-reviews 250 --country US --cap 100 --gap-ms 1500
 */
import { createDb, recordSweepRun, reviewCountsByApp, topChartedAppIds } from "@kittie/db";
import { seedCategoryReviews, DEFAULT_SEED_CATEGORIES } from "../db/seed-reviews.js";
import { syncAppleReviews } from "../apple/reviews.js";

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
  const db = createDb();
  const categories = flag("categories", DEFAULT_SEED_CATEGORIES.join(","))
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const report = await seedCategoryReviews(
    {
      db,
      topChartedAppIds: (o) => topChartedAppIds(db, o),
      reviewCountsByApp: (ids) => reviewCountsByApp(db, ids),
      syncReviews: (storeAppId, country, max) => syncAppleReviews(db, storeAppId, { country, max }),
    },
    {
      categories,
      country: flag("country", "US"),
      topN: Number(flag("top", "25")),
      maxReviewsPerApp: Number(flag("max-reviews", "250")),
      maxAppsPerRun: Number(flag("cap", "150")),
      gapMs: Number(flag("gap-ms", "1500")),
    },
  );

  console.log(`seed-reviews: ${report.totals.seeded} apps seeded, +${report.totals.newReviews} reviews, ` +
    `${report.totals.skipped} already-fresh skipped, ${report.totals.failed} failed, capRemaining=${report.capRemaining}`);
  for (const c of report.categories) {
    console.log(`  ${c.category}: resolved ${c.resolved}, seeded ${c.seeded} (+${c.newReviews}), skipped ${c.skipped}, failed ${c.failed}`);
  }
  const summary = `${report.totals.seeded} seeded, +${report.totals.newReviews} reviews across ${report.categories.length} categories`;
  await recordSweepRun(db, "review-corpus-seed", summary);
}

main().catch((err) => {
  console.error("seed-reviews failed:", err);
  process.exit(1);
});

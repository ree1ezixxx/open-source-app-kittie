/**
 * Force re-tag sweep (#266) — re-run the classifier over EVERY stored review,
 * overwriting stale tags, and print the before/after tag-distribution shift.
 * Run after any classifier change: `pnpm ingest:retag`. Idempotent; re-running
 * on an already-retagged corpus is a cheap no-op shift.
 */
import { createDb } from "@kittie/db";
import { retagAllReviews, type TagDistribution } from "../db/reviews.js";

function topShift(before: TagDistribution, after: TagDistribution, key: "topics" | "improvementAreas"): string[] {
  const labels = new Set([...Object.keys(before[key]), ...Object.keys(after[key])]);
  return [...labels]
    .map((l) => ({ l, b: before[key][l] ?? 0, a: after[key][l] ?? 0 }))
    .filter((x) => x.b !== x.a)
    .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))
    .slice(0, 15)
    .map((x) => `  ${x.l}: ${x.b} → ${x.a} (${x.a > x.b ? "+" : ""}${x.a - x.b})`);
}

async function main(): Promise<void> {
  const db = createDb();
  const t0 = Date.now();
  const { retagged, before, after } = await retagAllReviews(db);
  console.log(`retagged ${retagged} reviews in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`topics shift (top movers):`);
  for (const line of topShift(before, after, "topics")) console.log(line);
  console.log(`improvement-areas shift (top movers):`);
  for (const line of topShift(before, after, "improvementAreas")) console.log(line);
}

main().catch((err) => {
  console.error("retag sweep failed:", err);
  process.exit(1);
});

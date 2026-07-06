/**
 * Corpus-seeding core (#270) — pure orchestration over injected primitives so
 * it unit-tests without a DB or network. Resolves top charting apps per
 * category, skips apps that already hold reviews (idempotence/resume), pulls
 * the rest through the injected live sync, paced and capped for politeness.
 */
import type { Db } from "@kittie/db";

/** High-signal defaults; override with --categories. Names match `top-free:<cat>` chart suffixes. */
export const DEFAULT_SEED_CATEGORIES: readonly string[] = [
  "Health & Fitness",
  "Education",
  "Productivity",
  "Finance",
  "Lifestyle",
  "Food & Drink",
  "Travel",
  "Photo & Video",
  "Music",
  "Sports",
  "News",
  "Social Networking",
];

export interface SeedDeps {
  db: Db;
  topChartedAppIds(opts: { category: string; country?: string; store?: "apple" | "google"; topN?: number }): Promise<string[]>;
  reviewCountsByApp(ids: string[]): Promise<Record<string, number>>;
  /** Live per-app pull (classify+upsert inside). Returns NEW reviews stored. */
  syncReviews(storeAppId: string, country: string, max: number): Promise<number>;
  /** Injectable for tests; defaults to real sleep. */
  sleep?(ms: number): Promise<void>;
}

export interface SeedOptions {
  categories: string[];
  country?: string;
  topN?: number;
  maxReviewsPerApp?: number;
  /** Politeness cap: max apps synced in ONE run (resume covers the rest). */
  maxAppsPerRun?: number;
  gapMs?: number;
}

export interface CategorySeedReport {
  category: string;
  resolved: number;
  seeded: number;
  skipped: number;
  failed: number;
  newReviews: number;
}

export interface SeedReport {
  categories: CategorySeedReport[];
  totals: { resolved: number; seeded: number; skipped: number; failed: number; newReviews: number };
  /** Apps the per-run cap left for the next run (0 = fully covered). */
  capRemaining: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `apple:570060128` → `570060128` (the store-native id the sync endpoints take). */
export function storeAppIdOf(appId: string): string {
  const i = appId.indexOf(":");
  return i >= 0 ? appId.slice(i + 1) : appId;
}

export async function seedCategoryReviews(deps: SeedDeps, opts: SeedOptions): Promise<SeedReport> {
  const country = opts.country ?? "US";
  const topN = opts.topN ?? 25;
  const maxReviews = opts.maxReviewsPerApp ?? 250;
  const cap = opts.maxAppsPerRun ?? 150;
  const gapMs = opts.gapMs ?? 1500;
  const sleep = deps.sleep ?? realSleep;

  const categories: CategorySeedReport[] = [];
  let budget = cap;
  let capRemaining = 0;

  for (const category of opts.categories) {
    const report: CategorySeedReport = { category, resolved: 0, seeded: 0, skipped: 0, failed: 0, newReviews: 0 };
    const ids = await deps.topChartedAppIds({ category, country, store: "apple", topN });
    report.resolved = ids.length;

    // Idempotence/resume: an app already holding reviews is done — the
    // continuous sweep owns its freshness from here.
    const counts = await deps.reviewCountsByApp(ids);
    const pending = ids.filter((id) => (counts[id] ?? 0) === 0);
    report.skipped = ids.length - pending.length;

    for (const appId of pending) {
      if (budget <= 0) {
        capRemaining += 1;
        continue;
      }
      budget -= 1;
      try {
        const added = await deps.syncReviews(storeAppIdOf(appId), country, maxReviews);
        report.seeded += 1;
        report.newReviews += added;
      } catch (err) {
        // Per-app failure never kills the run — count it honestly and move on.
        report.failed += 1;
        console.warn(`seed-reviews: ${appId} failed: ${err instanceof Error ? err.message : err}`);
      }
      if (gapMs > 0) await sleep(gapMs);
    }
    categories.push(report);
  }

  const totals = categories.reduce(
    (t, c) => ({
      resolved: t.resolved + c.resolved,
      seeded: t.seeded + c.seeded,
      skipped: t.skipped + c.skipped,
      failed: t.failed + c.failed,
      newReviews: t.newReviews + c.newReviews,
    }),
    { resolved: 0, seeded: 0, skipped: 0, failed: 0, newReviews: 0 },
  );
  return { categories, totals, capRemaining };
}

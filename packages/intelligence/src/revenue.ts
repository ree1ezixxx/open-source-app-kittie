import type { AppSignals } from "./types.js";

const CATEGORY_BENCHMARK_USD: Record<string, number> = {
  "Health & Fitness": 45_000,
  "Productivity": 75_000,
  "Photo & Video": 60_000,
  "Social Networking": 90_000,
  "Games": 120_000,
  "Utilities": 35_000,
  "Education": 40_000,
  "Lifestyle": 50_000,
  "Finance": 85_000,
  "Entertainment": 55_000,
};

const DEFAULT_BENCHMARK = 40_000;

/** Chart rank → multiplier. Rank 1 ≈ 1.0, unranked ≈ 0.08. */
export function rankDecay(chartRank: number | null): number {
  if (chartRank == null || chartRank <= 0) return 0.08;
  return 1 / Math.log2(chartRank + 2);
}

function reviewVelocityBonus(reviewGrowth: number, reviewCount: number): number {
  if (reviewCount <= 0) return reviewGrowth > 0 ? 1.15 : 1;
  const velocity = reviewGrowth / reviewCount;
  return 1 + Math.min(Math.max(velocity, 0) * 8, 0.5);
}

function iapCountBonus(iapCount: number): number {
  return 1 + Math.min(iapCount * 0.05, 0.35);
}

function adActivityBonus(metaAdCount: number): number {
  if (metaAdCount <= 0) return 1;
  return 1 + Math.min(metaAdCount * 0.03, 0.25);
}

function categoryBenchmark(category: string | null): number {
  if (!category) return DEFAULT_BENCHMARK;
  return CATEGORY_BENCHMARK_USD[category] ?? DEFAULT_BENCHMARK;
}

/** Estimated monthly revenue (USD) from public signals. */
export function estimateRevenue(signals: AppSignals): number {
  const base = categoryBenchmark(signals.category) * rankDecay(signals.chartRank);
  const reviewGrowth =
    signals.reviewCountPrior != null
      ? signals.reviewCount - signals.reviewCountPrior
      : Math.round(signals.reviewCount * 0.02);

  const multiplier =
    reviewVelocityBonus(reviewGrowth, signals.reviewCount) *
    iapCountBonus(signals.iapCount) *
    adActivityBonus(signals.metaAdCount);

  return Math.round(base * multiplier);
}

/** Estimated monthly downloads derived from revenue heuristic. */
export function estimateDownloads(signals: AppSignals, revenueUsd: number): number {
  const arpu = signals.category === "Games" ? 1.5 : signals.iapCount > 3 ? 4 : 2.5;
  return Math.round(revenueUsd / arpu);
}

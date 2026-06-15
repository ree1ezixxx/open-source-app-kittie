import type { GrowthPeriod } from "@kittie/types";
import type { AppSignals } from "./types.js";
import { GROWTH_PERIOD_DAYS } from "./types.js";

const GROWTH_WEIGHTS = {
  reviewDelta: 0.35,
  rankDelta: 0.3,
  adCreativeDelta: 0.2,
  updateRecency: 0.15,
} as const;

const FIRST_MOVER_GROWTH_THRESHOLD = 65;
const CATEGORY_SATURATION_THRESHOLD = 80;
const FIRST_MOVER_RELEASE_DAYS = 90;

function scaleDelta(delta: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(Math.max(delta / cap, -1), 1);
}

/** Observed delta scaled to the full period when the prior sample is closer. */
function periodScaledReviewDelta(signals: AppSignals, periodDays: number): number {
  const prior = signals.reviewCountPrior ?? signals.reviewCount;
  const actualDays = Math.max(signals.priorDays ?? periodDays, 1);
  return (signals.reviewCount - prior) * (periodDays / actualDays);
}

function reviewDeltaScore(signals: AppSignals, periodDays: number): number {
  const prior = signals.reviewCountPrior ?? signals.reviewCount;
  const delta = periodScaledReviewDelta(signals, periodDays);
  const expectedCap = Math.max(prior * (periodDays / 30), 10);
  return scaleDelta(delta, expectedCap);
}

/** Negative rank change = climbing charts = positive score. */
function rankDeltaScore(signals: AppSignals): number {
  if (signals.chartRank == null || signals.chartRankPrior == null) return 0;
  const delta = signals.chartRankPrior - signals.chartRank;
  return scaleDelta(delta, 50);
}

function adCreativeDeltaScore(signals: AppSignals): number {
  const prior = signals.metaAdCountPrior ?? 0;
  const delta = signals.metaAdCount - prior;
  return scaleDelta(delta, 5);
}

function updateRecencyScore(updatedAt: Date | null): number {
  if (!updatedAt) return 0;
  const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 1;
  if (daysSince <= 30) return 0.6;
  if (daysSince <= 90) return 0.2;
  return -0.3;
}

function toGrowthScore(raw: number): number {
  return Math.round(Math.min(Math.max((raw + 1) * 50, 0), 100) * 10) / 10;
}

/** Composite growth score 0–100 for a given window. */
export function computeGrowthScore(signals: AppSignals, period: GrowthPeriod = "7d"): number {
  const periodDays = GROWTH_PERIOD_DAYS[period];
  const raw =
    GROWTH_WEIGHTS.reviewDelta * reviewDeltaScore(signals, periodDays) +
    GROWTH_WEIGHTS.rankDelta * rankDeltaScore(signals) +
    GROWTH_WEIGHTS.adCreativeDelta * adCreativeDeltaScore(signals) +
    GROWTH_WEIGHTS.updateRecency * updateRecencyScore(signals.updatedAt);

  return toGrowthScore(raw);
}

export function isFirstMover(signals: AppSignals, growthScore: number): boolean {
  if (growthScore < FIRST_MOVER_GROWTH_THRESHOLD) return false;
  if (signals.categoryAppCount >= CATEGORY_SATURATION_THRESHOLD) return false;
  if (!signals.releasedAt) return false;

  const daysSinceRelease =
    (Date.now() - signals.releasedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRelease <= FIRST_MOVER_RELEASE_DAYS;
}

export function reviewGrowth7d(signals: AppSignals): number {
  const prior = signals.reviewCountPrior ?? signals.reviewCount;
  return signals.reviewCount - prior;
}

/**
 * Real period-scaled review-growth percentage (the proxy behind MRR growth).
 * Null without a prior sample — the UI shows an honest "—", never a fake 0.
 */
export function computeGrowthPct(
  signals: AppSignals,
  period: GrowthPeriod = "7d",
): number | null {
  if (signals.reviewCountPrior == null) return null;
  const periodDays = GROWTH_PERIOD_DAYS[period];
  const scaledDelta = periodScaledReviewDelta(signals, periodDays);
  // Damp tiny-base noise: 3 new reviews on a 2-review app is not "+150%".
  const base = Math.max(signals.reviewCountPrior, 10);
  const pct = (scaledDelta / base) * 100;
  return Math.round(Math.min(Math.max(pct, -99), 999) * 10) / 10;
}

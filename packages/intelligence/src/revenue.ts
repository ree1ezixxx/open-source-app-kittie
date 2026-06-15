import type { AppSignals } from "./types.js";

/**
 * Per-review monthly ARPU anchor (USD), by category.
 *
 * Revenue is anchored on **reviewCount** — the one strong scale signal we have for the
 * entire catalog (a #1 app has millions of ratings, a dead app has a dozen). chartRank is
 * null for ~all crawled apps, so it can only be a *bonus* when present, never the anchor.
 * These numbers are calibrated so the modeled distribution spans realistically: ~$0 for the
 * long tail, $100K+ for the top ~1%, $1M+ for the handful of true giants.
 */
const CATEGORY_ARPU_USD: Record<string, number> = {
  "Games": 9,
  "Finance": 11,
  "Social Networking": 8,
  "Productivity": 7,
  "Photo & Video": 6,
  "Health & Fitness": 7,
  "Entertainment": 6,
  "Food & Drink": 8,
  "Shopping": 7,
  "Music": 6,
  "Education": 4,
  "Lifestyle": 5,
  "Utilities": 4,
  "Navigation": 5,
};

const DEFAULT_ARPU = 5;

/**
 * Sub-linear exponent on reviewCount. <1 compresses the extreme top (a 47M-review app
 * isn't 47M× the revenue of a 1M-review app) while preserving a heavy tail.
 */
const REVIEW_EXP = 0.85;

/** Global calibration knob — scale the whole revenue axis without touching category mix. */
const REVENUE_SCALE = 1;

/** Legacy rank→multiplier helper. Kept for the public export; no longer anchors revenue. */
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

/** Rating as a quality modifier (0.79–1.15). Unrated apps are neutral. */
function ratingFactor(rating: number | null): number {
  if (rating == null || rating <= 0) return 1;
  return 0.7 + (Math.min(rating, 5) / 5) * 0.45;
}

/** Chart rank, when known, is a *lift* (1.0–1.5) — never a penalty for the unranked majority. */
function rankBonus(chartRank: number | null): number {
  if (chartRank == null || chartRank <= 0) return 1;
  return 1 + 0.5 / Math.log2(chartRank + 1);
}

function categoryArpu(category: string | null): number {
  if (!category) return DEFAULT_ARPU;
  return CATEGORY_ARPU_USD[category] ?? DEFAULT_ARPU;
}

/** Estimated monthly revenue (USD) from public signals, anchored on review volume. */
export function estimateRevenue(signals: AppSignals): number {
  const reviews = Math.max(signals.reviewCount, 0);
  if (reviews <= 0) return 0;

  const base = categoryArpu(signals.category) * Math.pow(reviews, REVIEW_EXP) * REVENUE_SCALE;

  const reviewGrowth =
    signals.reviewCountPrior != null
      ? signals.reviewCount - signals.reviewCountPrior
      : Math.round(signals.reviewCount * 0.02);

  const multiplier =
    ratingFactor(signals.rating) *
    reviewVelocityBonus(reviewGrowth, signals.reviewCount) *
    iapCountBonus(signals.iapCount) *
    adActivityBonus(signals.metaAdCount) *
    rankBonus(signals.chartRank);

  return Math.round(base * multiplier);
}

/** Estimated monthly downloads derived from revenue heuristic. */
export function estimateDownloads(signals: AppSignals, revenueUsd: number): number {
  const arpu = signals.category === "Games" ? 1.5 : signals.iapCount > 3 ? 4 : 2.5;
  return Math.round(revenueUsd / arpu);
}

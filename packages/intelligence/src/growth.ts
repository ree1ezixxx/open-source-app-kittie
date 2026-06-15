import type { GrowthPeriod } from "@kittie/types";
import type { AppSignals, GrowthSample, GrowthWindow } from "./types.js";

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

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) / 86_400_000;
}

function usableWindow(signals: AppSignals, period: GrowthPeriod): GrowthWindow | null {
  const window = signals.growthWindow;
  if (!window || window.period !== period) return null;
  if (window.coveredDays < window.requiredDays) return null;
  const distinctDays = new Set(window.samples.map((sample) => sample.date));
  if (distinctDays.size < 2) return null;
  return window;
}

function slope(
  samples: GrowthSample[],
  valueOf: (sample: GrowthSample) => number | null,
): number | null {
  const points = samples
    .map((sample) => ({ x: dayNumber(sample.date), y: valueOf(sample) }))
    .filter((point): point is { x: number; y: number } => point.y !== null)
    .sort((a, b) => a.x - b.x);
  if (points.length < 2) return null;

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    numerator += dx * (point.y - meanY);
    denominator += dx * dx;
  }
  return denominator === 0 ? null : numerator / denominator;
}

function firstReviewCount(samples: GrowthSample[]): number {
  return [...samples].sort((a, b) => a.date.localeCompare(b.date))[0]?.reviewCount ?? 0;
}

function spanReviewDelta(window: GrowthWindow): number | null {
  const perDay = slope(window.samples, (sample) => sample.reviewCount);
  return perDay === null ? null : perDay * window.periodDays;
}

function reviewDeltaScore(window: GrowthWindow): number {
  const delta = spanReviewDelta(window);
  if (delta === null) return 0;
  const base = Math.max(firstReviewCount(window.samples), 1);
  const expectedCap = Math.max(base * (window.periodDays / 30), 10);
  return scaleDelta(delta, expectedCap);
}

/** Negative rank change = climbing charts = positive score. */
function rankDeltaScore(window: GrowthWindow): number {
  const perDay = slope(window.samples, (sample) => sample.chartRank);
  if (perDay === null) return 0;
  const delta = -perDay * window.periodDays;
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
export function computeGrowthScore(
  signals: AppSignals,
  period: GrowthPeriod = "7d",
): number | null {
  const window = usableWindow(signals, period);
  if (!window) return null;

  const raw =
    GROWTH_WEIGHTS.reviewDelta * reviewDeltaScore(window) +
    GROWTH_WEIGHTS.rankDelta * rankDeltaScore(window) +
    GROWTH_WEIGHTS.adCreativeDelta * adCreativeDeltaScore(signals) +
    GROWTH_WEIGHTS.updateRecency * updateRecencyScore(signals.updatedAt);

  return toGrowthScore(raw);
}

export function isFirstMover(signals: AppSignals, growthScore: number | null): boolean {
  if (growthScore === null) return false;
  if (growthScore < FIRST_MOVER_GROWTH_THRESHOLD) return false;
  if (signals.categoryAppCount >= CATEGORY_SATURATION_THRESHOLD) return false;
  if (!signals.releasedAt) return false;

  const daysSinceRelease =
    (Date.now() - signals.releasedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRelease <= FIRST_MOVER_RELEASE_DAYS;
}

export function reviewGrowth7d(signals: AppSignals): number | null {
  const window = usableWindow(signals, "7d");
  if (!window) return null;
  const delta = spanReviewDelta(window);
  return delta === null ? null : Math.round(delta);
}

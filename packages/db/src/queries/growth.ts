import {
  GROWTH_COVERAGE_MIN,
  type GrowthPeriod,
  type GrowthWindow,
} from "@kittie/types";

/**
 * Span-based growth, per ADR-0001.
 *
 * Growth is computed across *every* day in a window — never a raw two-point
 * delta between today and one prior snapshot. A single outlier day (a launch
 * blip, a weekend dip, a one-day chart spike) cannot move the number, because
 * each end of the window is a trailing average and the whole series also feeds
 * a regression slope. A window only renders once enough of its days are
 * present (the coverage gate); below that it stays "building". Missing days are
 * absent, never imputed as zero — a gap must not silently drag growth down.
 *
 * This module is intentionally pure: it takes a sparse daily series and a
 * window definition and returns a {@link GrowthWindow}. The DB query layer
 * (`signals.ts`) loads the series; everything here is deterministic arithmetic
 * so it is trivially unit-testable without a database.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const GROWTH_PERIOD_DAYS: Record<GrowthPeriod, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

/** One day of one metric. `date` is a UTC `YYYY-MM-DD`; absent days are simply not in the array. */
export interface SeriesPoint {
  date: string;
  value: number;
}

export interface GrowthWindowOptions {
  /**
   * Smoothing width τ (days) for each trailing-average endpoint. Defaults to a
   * value scaled to the window: light for 7d, heavier for 30/90d. Override only
   * in tests or when a caller has a specific responsiveness requirement.
   */
  smoothingDays?: number;
  /** Coverage gate; defaults to {@link GROWTH_COVERAGE_MIN}. */
  coverageMin?: number;
}

function parseUtcDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** Whole-day offset of `date` after `start` (both `YYYY-MM-DD`). */
function dayOffset(date: string, start: string): number {
  return Math.round((parseUtcDate(date) - parseUtcDate(start)) / MS_PER_DAY);
}

function shiftDate(date: string, deltaDays: number): string {
  return new Date(parseUtcDate(date) + deltaDays * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * Trailing-average smoothing width for a window.
 *
 * Anchored at the ADR's "≈3-day trailing" for the 7-day window and scaled up
 * proportionally so longer windows smooth harder (stability over reaction
 * speed): τ = round(N · 3/7), then clamped to [1, ⌊N/2⌋] so the recent and
 * baseline edges never overlap.
 */
export function smoothingForWindow(windowDays: number): number {
  const scaled = Math.round((windowDays * 3) / 7);
  const maxNonOverlapping = Math.floor(windowDays / 2);
  return Math.max(1, Math.min(scaled, Math.max(1, maxNonOverlapping)));
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Least-squares slope (value per day) over present points; null if fewer than two. */
function regressionSlope(points: Array<{ x: number; y: number }>): number | null {
  const n = points.length;
  if (n < 2) return null;
  const meanX = mean(points.map((p) => p.x));
  const meanY = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const { x, y } of points) {
    const dx = x - meanX;
    num += dx * (y - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}

function building(
  window: GrowthPeriod,
  windowDays: number,
  coverage: number,
  presentDays: number,
): GrowthWindow {
  return {
    window,
    windowDays,
    state: "building",
    coverage,
    presentDays,
    recentAvg: null,
    baselineAvg: null,
    absoluteChange: null,
    relativeChange: null,
    slopePerDay: null,
  };
}

/**
 * Compute a single growth window from a sparse daily series.
 *
 * @param series  All snapshots for one app/metric (any order, gaps allowed).
 * @param asOf    The window's most-recent day (`YYYY-MM-DD`), inclusive — usually the latest snapshot date.
 * @param period  Window label, e.g. "7d" / "30d".
 */
export function computeGrowthWindow(
  series: SeriesPoint[],
  asOf: string,
  period: GrowthPeriod,
  options: GrowthWindowOptions = {},
): GrowthWindow {
  const windowDays = GROWTH_PERIOD_DAYS[period];
  const coverageMin = options.coverageMin ?? GROWTH_COVERAGE_MIN;
  const tau = Math.min(
    options.smoothingDays ?? smoothingForWindow(windowDays),
    Math.max(1, Math.floor(windowDays / 2)),
  );

  // Window covers [asOf − (N−1) … asOf], indexed 0 … N−1 from the start edge.
  const startDate = shiftDate(asOf, -(windowDays - 1));
  const inWindow = series
    .map((p) => ({ offset: dayOffset(p.date, startDate), value: p.value }))
    .filter((p) => p.offset >= 0 && p.offset <= windowDays - 1);

  const presentDays = inWindow.length;
  const coverage = presentDays / windowDays;

  // Coverage gate: no metric may hang on a thin sample.
  if (coverage < coverageMin) {
    return building(period, windowDays, coverage, presentDays);
  }

  // Baseline edge = first τ days; recent edge = last τ days. Gaps contribute
  // nothing (never zero): we average only the present values in each edge.
  const baselineEdge = inWindow.filter((p) => p.offset <= tau - 1).map((p) => p.value);
  const recentEdge = inWindow
    .filter((p) => p.offset >= windowDays - tau)
    .map((p) => p.value);

  // Each edge must itself rest on more than a single day once smoothing is
  // meaningful — otherwise a clustered gap could reintroduce a two-point
  // cherry-pick even at acceptable overall coverage.
  const minEdgeSupport = tau >= 3 ? 2 : 1;
  if (baselineEdge.length < minEdgeSupport || recentEdge.length < minEdgeSupport) {
    return building(period, windowDays, coverage, presentDays);
  }

  const baselineAvg = mean(baselineEdge);
  const recentAvg = mean(recentEdge);
  const absoluteChange = recentAvg - baselineAvg;
  const relativeChange =
    baselineAvg === 0 ? null : absoluteChange / Math.abs(baselineAvg);
  const slopePerDay = regressionSlope(
    inWindow.map((p) => ({ x: p.offset, y: p.value })),
  );

  return {
    window: period,
    windowDays,
    state: "ready",
    coverage,
    presentDays,
    recentAvg,
    baselineAvg,
    absoluteChange,
    relativeChange,
    slopePerDay,
  };
}

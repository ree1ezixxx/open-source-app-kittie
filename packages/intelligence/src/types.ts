import type { GrowthPeriod, GrowthWindow, Store } from "@kittie/types";

/** Raw signals used by estimation models — from snapshots or fixtures. */
export interface AppSignals {
  category: string | null;
  chartRank: number | null;
  reviewCount: number;
  /**
   * @deprecated Single-day endpoint review count N days back. Growth scoring
   * now reads `reviewGrowthWindow` (ADR-0001); retained only for the revenue
   * model's velocity bonus until that migrates too.
   */
  reviewCountPrior: number | null;
  rating: number | null;
  iapCount: number;
  metaAdCount: number;
  metaAdCountPrior: number | null;
  /** @deprecated Endpoint chart rank N days back — superseded by `rankGrowthWindow`. */
  chartRankPrior: number | null;
  /** Span-based review-count growth for the active window (ADR-0001). */
  reviewGrowthWindow: GrowthWindow;
  /** Span-based chart-rank growth for the active window (lower rank = better). */
  rankGrowthWindow: GrowthWindow;
  updatedAt: Date | null;
  releasedAt: Date | null;
  categoryAppCount: number;
}

export interface GrowthInput {
  signals: AppSignals;
  period: GrowthPeriod;
}

export interface RevenueInput {
  signals: AppSignals;
}

export interface KeywordDifficultyInput {
  keyword: string;
  country: string;
  store: Store;
  topRankedApps: Array<{
    title: string;
    iconUrl: string | null;
    reviewCount: number;
    rating: number | null;
    rank: number;
  }>;
}

export const GROWTH_PERIOD_DAYS: Record<GrowthPeriod, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

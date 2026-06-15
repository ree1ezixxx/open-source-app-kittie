import type { GrowthPeriod, Store } from "@kittie/types";

/** Raw signals used by estimation models — from snapshots or fixtures. */
export interface AppSignals {
  category: string | null;
  chartRank: number | null;
  reviewCount: number;
  reviewCountPrior: number | null;
  rating: number | null;
  iapCount: number;
  metaAdCount: number;
  metaAdCountPrior: number | null;
  chartRankPrior: number | null;
  updatedAt: Date | null;
  releasedAt: Date | null;
  categoryAppCount: number;
  growthWindow: GrowthWindow | null;
}

export interface GrowthInput {
  signals: AppSignals;
  period: GrowthPeriod;
}

export interface GrowthSample {
  date: string;
  reviewCount: number;
  chartRank: number | null;
}

export interface GrowthWindow {
  period: GrowthPeriod;
  periodDays: number;
  startDate: string;
  endDate: string;
  coveredDays: number;
  requiredDays: number;
  samples: GrowthSample[];
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
  /**
   * Real search-popularity (0–100) from store autocomplete reach, when available.
   * Differentiates demand per term; review-based estimate is the fallback. See
   * `searchPopularity` in @kittie/ingest.
   */
  searchPopularity?: number | null;
}

export const GROWTH_PERIOD_DAYS: Record<GrowthPeriod, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

/** Store identifier — one App per store listing. */
export type Store = "apple" | "google";

export type GrowthPeriod = "7d" | "14d" | "30d" | "60d" | "90d";

/**
 * Minimum fraction of a window's days that must hold a snapshot before that
 * window may render a number. Below this, growth is "building…", never a value.
 * See ADR-0001 — growth is a coverage-gated span statistic.
 */
export const GROWTH_COVERAGE_MIN = 0.7;

/**
 * A growth window is either `ready` (enough coverage to render an honest,
 * outlier-robust number) or `building` (too few days accrued yet). It is never
 * an endpoint delta — see ADR-0001. All change figures are span statistics
 * computed across the whole window from the immutable daily series.
 */
export type GrowthWindowState = "ready" | "building";

export interface GrowthWindow {
  /** Window label this result is for. */
  window: GrowthPeriod;
  /** Calendar span of the window in days. */
  windowDays: number;
  /** `ready` only when coverage clears GROWTH_COVERAGE_MIN. */
  state: GrowthWindowState;
  /** Fraction of window days that hold a snapshot (0–1). */
  coverage: number;
  /** Count of snapshots present inside the window. */
  presentDays: number;
  /** Trailing-average of the recent edge of the window; null while building. */
  recentAvg: number | null;
  /** Trailing-average of the baseline edge of the window; null while building. */
  baselineAvg: number | null;
  /** recentAvg − baselineAvg (smoothed); null while building. */
  absoluteChange: number | null;
  /** (recent − baseline) / |baseline|; null while building or baseline 0. */
  relativeChange: number | null;
  /** Least-squares slope per day over present points; null while building. */
  slopePerDay: number | null;
}

/**
 * Canonical store-chart list. The raw `chart_category` column has drifted
 * across ingest versions (`top-free` vs `topfreeapplications`, etc.); callers
 * always work in these normalized values — see `normalizeChartType`.
 */
export type ChartType = "free" | "paid" | "grossing";

/** One ranked app in a store chart, with its day-over-day movement. */
export interface ChartEntry {
  /** 1-based position on the resolved chart date (ascending = better). */
  rank: number;
  /** priorRank − rank (positive = climbed); null when there is no prior day. */
  rankDelta: number | null;
  app: {
    id: string;
    store: Store;
    storeAppId: string;
    title: string;
    developer: string;
    iconUrl: string | null;
    category: string | null;
  };
  rating: number | null;
  reviewCount: number;
}

/** A resolved store-ranking chart — what `GET /api/v1/charts` returns. */
export interface TopChartsResult {
  store: Store;
  country: string;
  type: ChartType;
  /** Genre filter applied, or null for the overall chart. */
  category: string | null;
  /** Chart date the entries are from (`YYYY-MM-DD`), or null when no data. */
  date: string | null;
  entries: ChartEntry[];
}

export type AppSortField =
  | "growth"
  | "rating"
  | "reviews"
  | "updated"
  | "released"
  | "downloads"
  | "revenue"
  | "trending"
  | "newest";

export type SortOrder = "asc" | "desc";

export type PriceType = "all" | "free" | "paid";

/** Query params for GET /api/v1/apps — AppKittie-compatible subset. */
export interface AppSearchParams {
  search?: string;
  categories?: string;
  excludedCategories?: string;
  source?: Store;
  excludedSource?: Store;
  minDownloads?: number;
  maxDownloads?: number;
  minRevenue?: number;
  maxRevenue?: number;
  minRating?: number;
  maxRating?: number;
  minReviews?: number;
  maxReviews?: number;
  priceType?: PriceType;
  minPrice?: number;
  maxPrice?: number;
  growthPeriod?: GrowthPeriod;
  growthType?: "all" | "positive" | "negative";
  minGrowth?: number;
  maxGrowth?: number;
  hasMetaAds?: boolean;
  hasAppleAds?: boolean;
  hasCreators?: boolean;
  hasEmails?: boolean;
  hasWebsite?: boolean;
  contentRating?: string;
  languages?: string;
  developer?: string;
  releasedAfter?: number;
  updatedAfter?: number;
  sortBy?: AppSortField;
  sortOrder?: SortOrder;
  limit?: number;
  cursor?: string;
}

export interface AppListItem {
  id: string;
  store: Store;
  storeAppId: string;
  title: string;
  iconUrl: string | null;
  developer: string;
  category: string | null;
  rating: number | null;
  reviewCount: number;
  reviewGrowth7d: number | null;
  downloadsEstimate30d: number | null;
  revenueEstimate30d: number | null;
  growthScore: number | null;
  isFirstMover: boolean;
  releasedAt: string | null;
  updatedAt: string | null;
}

export interface AppDetail extends AppListItem {
  description: string | null;
  screenshotUrls: string[];
  websiteUrl: string | null;
  supportEmail: string | null;
  price: number | null;
  contentRating: string | null;
  languages: string[];
  iaps: AppIap[];
  metaAds: MetaAdCreative[];
  appleSearchAds: AppleSearchAd[];
  creators: CreatorPartnership[];
  historicals: AppHistoricalPoint[];
}

export interface AppIap {
  name: string;
  price: number | null;
  currency: string | null;
}

export interface MetaAdCreative {
  id: string;
  platform: "meta";
  adCopy: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  status: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface AppleSearchAd {
  country: string;
  keyword: string;
  rank: number | null;
}

export interface CreatorPartnership {
  platform: "tiktok" | "instagram" | "youtube" | "other";
  handle: string;
  profileUrl: string | null;
  followerCount: number | null;
}

export interface AppHistoricalPoint {
  date: string;
  reviewCount: number | null;
  rating: number | null;
  chartRank: number | null;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
}

export interface Review {
  id: string;
  appId: string;
  store: Store;
  country: string;
  rating: number;
  title: string | null;
  body: string;
  author: string | null;
  reviewedAt: string;
}

export interface KeywordDifficulty {
  keyword: string;
  country: string;
  store: Store;
  popularity: number;
  difficulty: number;
  trafficScore: number;
  competingAppCount: number;
  topApps: Array<{
    title: string;
    iconUrl: string | null;
    reviewCount: number;
    rating: number | null;
    rank: number;
  }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    totalCount: number;
  };
}

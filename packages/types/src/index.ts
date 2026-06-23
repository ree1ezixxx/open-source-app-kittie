export * from "./provenance.js";
export * from "./decision-packet.js";

/** Store identifier — one App per store listing. */
export type Store = "apple" | "google";

export type GrowthPeriod = "7d" | "14d" | "30d" | "60d" | "90d";

/**
 * Canonical store-chart type. The raw `chart_category` column has drifted
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
  /** Snapshot estimates on the chart date (for the Downloads / MRR columns). */
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
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
  | "newest"
  | "rankDelta";

export type SortOrder = "asc" | "desc";

export type PriceType = "all" | "free" | "paid";

/** Fields the list search can match — mirrors AppKittie `textSearchFields`. */
export type TextSearchField = "title" | "developer" | "description";

/** Query params for GET /api/v1/apps — AppKittie-compatible subset. */
export interface AppSearchParams {
  search?: string;
  /** Comma-separated subset of title / developer / description; default = all three. */
  textSearchFields?: string;
  categories?: string;
  excludedCategories?: string;
  source?: Store;
  excludedSource?: Store;
  /** Comma-separated ISO alpha-2 markets to include (e.g. "US,JP"). Absent = US-only default view. Mirrors AppKittie `countries`. */
  countries?: string;
  /** Comma-separated ISO alpha-2 markets to exclude. Mirrors AppKittie `excludedCountries`. */
  excludedCountries?: string;
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
  /** Real period-scaled growth % (review-velocity proxy); null until a prior snapshot exists. */
  growthPct: number | null;
  /** Estimates recomputed from the prior snapshot's signals — power rank-change deltas. */
  downloadsEstimatePrior: number | null;
  revenueEstimatePrior: number | null;
  /**
   * Signed chart-rank movement between this app's two most recent ranked
   * snapshot days (priorRank − latestRank; positive = climbed). Null when the
   * app lacks two ranked snapshots. Powers the Highlights "1D" column.
   */
  rankDelta: number | null;
  /** Last ≤7 daily review counts (oldest→newest); drives the row sparkline. */
  sparkline?: number[];
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
  /** Listing facts — lazily backfilled from Apple lookup; null for Google apps. */
  fileSizeBytes: number | null;
  minOsVersion: string | null;
  sellerName: string | null;
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

/** Four-way sentiment used across the Reviews surface. */
export type Sentiment4 = "positive" | "neutral" | "negative" | "mixed";

/** Per-review classification — produced once at ingest, persisted, then
    aggregated cheaply by every surface. The classifier seam lives in
    `@kittie/intelligence`. */
export interface ReviewTags {
  sentiment: Sentiment4;
  /** Open-ish descriptive themes — what the review is *about*. */
  topics: string[];
  /** Fixed canonical taxonomy — what the app could *fix*. */
  improvementAreas: string[];
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
  /** Persisted classification (null on legacy rows ingested before tagging). */
  sentiment?: Sentiment4 | null;
  topics?: string[] | null;
  improvementAreas?: string[] | null;
}

export interface KeywordDifficulty {
  keyword: string;
  country: string;
  store: Store;
  popularity: number;
  difficulty: number;
  trafficScore: number;
  opportunityScore: number;
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

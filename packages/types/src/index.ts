/** Store identifier — one App per store listing. */
export type Store = "apple" | "google";

export type GrowthPeriod = "7d" | "14d" | "30d" | "60d" | "90d";

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
  opportunityScore: number;
  competingAppCount: number;
  topApps: Array<{
    title: string;
    iconUrl: string | null;
    reviewCount: number;
    rating: number | null;
    rank: number;
  }>;
  computedAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    totalCount: number;
  };
}

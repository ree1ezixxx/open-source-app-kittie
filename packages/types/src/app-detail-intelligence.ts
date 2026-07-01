import type { IntelligenceResponseEnvelope } from "./intelligence-response.js";

export type AppDetailIntelligenceStore = "apple" | "google";

export interface AppDetailIntelligenceRequest {
  /** Existing Kittie app id, or a deterministic store id like `apple:6446901002`. */
  appId?: string;
  /** Free-text app query. Must resolve to exactly one app. */
  query?: string;
  store?: AppDetailIntelligenceStore;
}

export interface AppDetailIntelligenceData {
  app: {
    id: string;
    store: AppDetailIntelligenceStore;
    storeAppId: string;
    title: string;
    developer: string;
    category: string | null;
    iconUrl: string | null;
    releasedAt: string | null;
    updatedAt: string | null;
  };
  observed: {
    rating: number | null;
    reviewCount: number;
    chartRank: number | null;
    listingMediaCount: number;
    hasDescription: boolean;
    hasWebsite: boolean;
  };
  estimated: {
    downloads30d: number | null;
    revenue30dUsd: number | null;
    growthScore: number | null;
    growthPct: number | null;
    isFirstMover: boolean;
  };
  relationships: {
    inAppPurchaseCount: number;
    metaAdCount: number;
    appleSearchAdCount: number;
    creatorCount: number;
    reviewSampleCount: number;
  };
}

export type AppDetailIntelligenceResponse =
  IntelligenceResponseEnvelope<AppDetailIntelligenceData, "app_detail">;

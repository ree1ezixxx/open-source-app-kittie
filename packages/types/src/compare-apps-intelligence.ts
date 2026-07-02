import type { IntelligenceResponseEnvelope } from "./intelligence-response.js";

type CompareAppsStore = "apple" | "google";

export interface CompareAppRef {
  /** Existing Kittie app id, or a deterministic store id like `apple:6446901002`. */
  appId?: string;
  /** Free-text app query. Must resolve to exactly one app. */
  query?: string;
  store?: CompareAppsStore;
}

export interface CompareAppsIntelligenceRequest {
  apps: CompareAppRef[];
}

export type CompareDimensionKey =
  | "category"
  | "rating"
  | "reviews"
  | "growth_score"
  | "growth_pct"
  | "downloads_30d"
  | "revenue_30d_usd"
  | "chart_rank"
  | "listing_media"
  | "monetization_signals"
  | "marketing_signals";

export interface CompareAppsDimension {
  key: CompareDimensionKey;
  label: string;
  valueType: "text" | "number" | "currency" | "percent" | "boolean";
  unit: string | null;
  higherIsBetter: boolean | null;
}

export interface CompareAppsRow {
  appId: string;
  store: CompareAppsStore;
  storeAppId: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  values: Record<CompareDimensionKey, string | number | boolean | null>;
  evidenceIds: string[];
  caveats: string[];
}

export interface CompareAppsInsight {
  kind: "leader" | "gap" | "missing_data";
  message: string;
  evidenceIds: string[];
}

export interface CompareAppsIntelligenceData {
  dimensions: CompareAppsDimension[];
  rows: CompareAppsRow[];
  insights: CompareAppsInsight[];
}

export type CompareAppsIntelligenceResponse =
  IntelligenceResponseEnvelope<CompareAppsIntelligenceData, "compare_apps">;

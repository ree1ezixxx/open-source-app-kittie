/**
 * cluster_reviews contracts (#259) — the shared I/O shapes for the agent-facing
 * review-theme clustering primitive. Clusters user reviews ACROSS a competitor
 * set (not one app) into ranked complaint/praise/request/bug/pricing/ux themes,
 * each carrying frequency, sentiment, cross-app spread, evidence quotes, a trend
 * direction, and confidence. First rung of the decision ladder that #260
 * (feature gaps) and #261 (whitespace ideas) build on: complaints → gaps → bets.
 *
 * The response wraps in the canonical #180 `IntelligenceResponseEnvelope` under
 * responseType `"review_clusters"`. The deterministic base (stored review tags)
 * is always available; LLM enrichment names/types themes when configured and
 * degrades honestly (never fabricates) when it is not.
 */
import type {
  IntelligenceResponseEnvelope,
  SourceCoverage,
} from "./intelligence-response.js";
import type { Store } from "./index.js";

/** What a theme is about — a controlled vocabulary so agents can branch on it. */
export type ReviewThemeType =
  | "complaint"
  | "praise"
  | "request"
  | "bug"
  | "pricing"
  | "ux"
  | "other";

export const REVIEW_THEME_TYPES: readonly ReviewThemeType[] = [
  "complaint",
  "praise",
  "request",
  "bug",
  "pricing",
  "ux",
  "other",
];

/** Direction of a theme's mention volume over time (last 30d vs the prior 30d). */
export type ReviewThemeTrend = "rising" | "falling" | "stable" | "unknown";

/** One app's slice of a theme — how much this competitor drives it. */
export interface ReviewThemeAppBreakdown {
  appId: string;
  appName: string;
  mentionCount: number;
  /** Mean rating of the reviews mentioning this theme for this app; null when unknown. */
  avgRating: number | null;
  /** Mean sentiment (−1..1) of this app's mentions. */
  sentiment: number;
}

/** A representative review quote — evidence for a theme. NEVER carries author/PII. */
export interface ReviewThemeQuote {
  appId: string;
  appName: string | null;
  rating: number | null;
  text: string;
  /** ISO date; null when the source row had no review date. */
  date: string | null;
}

/** One ranked review theme across the competitor set. */
export interface ReviewTheme {
  /** Plain-language theme name (LLM-named when enriched; canonical topic label otherwise). */
  theme: string;
  type: ReviewThemeType;
  /** `mentionCount / totalReviewsAnalyzed`, 0..1. */
  freq: number;
  mentionCount: number;
  /** Mean sentiment across member reviews, −1..1. */
  sentiment: number;
  /** Display names of apps this theme appears in. */
  apps: string[];
  appBreakdown: ReviewThemeAppBreakdown[];
  quotes: ReviewThemeQuote[];
  trend: ReviewThemeTrend;
  /** 0..1 — driven by mention volume, cross-app spread and recency. */
  confidence: number;
}

/** Per-app review coverage — honest reporting of what was actually analyzed. */
export interface ReviewClusterAppCoverage {
  appId: string;
  appName: string;
  /** Reviews held locally for this app that fed the clustering (may be 0). */
  reviewsAnalyzed: number;
}

/** How the themes were produced. */
export type ReviewClusterEnrichment = "llm" | "deterministic";

/** `data` payload of a `review_clusters` response. */
export interface ReviewClustersData {
  /** Echoed, normalised free-text scope; null when the set was given as `appIds`. */
  query: string | null;
  country: string;
  /** Resolved competitor set (ids), in analysis order. */
  appIds: string[];
  /** Total reviews across all apps that fed the clustering. */
  totalReviewsAnalyzed: number;
  /** Per-app coverage, including apps with zero local reviews. */
  coverage: ReviewClusterAppCoverage[];
  /** Ranked themes, densest / most-confident first. */
  themes: ReviewTheme[];
  /** Whether themes were LLM-named or come straight from the deterministic tag base. */
  enrichment: ReviewClusterEnrichment;
  /** What this answer is standing on (#271). */
  sourceCoverage: SourceCoverage;
}

/**
 * Request body for `cluster_reviews`. Provide `query` OR `appIds` (at least one).
 * When both are given, `appIds` wins — an explicit set is never overridden by a
 * discovery query.
 */
export interface ClusterReviewsRequest {
  /** Free-text niche/description → competitor discovery via `find_similar_apps`. */
  query?: string;
  /** Explicit competitor set (app ids). Takes precedence over `query` when both given. */
  appIds?: string[];
  /** ISO market (default `"US"`). */
  country?: string;
  /** Max apps in the competitor set (default 10, max 25). */
  limitApps?: number;
  /** Max reviews sampled per app (default 100, bounded to 500). */
  maxReviewsPerApp?: number;
  /** Only cluster reviews on/after this ISO date. */
  since?: string;
  /** Restrict the returned themes to these types. */
  themeTypes?: ReviewThemeType[];
  /** Drop themes below this frequency (0..1, default 0.02). */
  minThemeFrequency?: number;
  /** Restrict competitor discovery to one store (query mode only). */
  store?: Store;
}

/** The full `cluster_reviews` response — the canonical envelope over `ReviewClustersData`. */
export type ReviewClustersIntelligenceResponse = IntelligenceResponseEnvelope<
  ReviewClustersData,
  "review_clusters"
>;

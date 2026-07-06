/**
 * find_feature_gaps contracts (#260) — the shared I/O shapes for the agent-facing
 * feature × competitor matrix. Cross-references what a category's apps OFFER
 * (extracted from listings) against what users DEMAND (review themes from #259
 * `cluster_reviews`), and separates table-stakes features from genuine whitespace
 * gaps. Second rung of the decision ladder: complaints → **gaps** → ranked bets.
 *
 * The response wraps in the canonical #180 `IntelligenceResponseEnvelope` under
 * responseType `"feature_gaps"`. Coverage is deterministic (listing lexicon);
 * demand/quality come from the review-cluster service; the LLM seam only sharpens
 * feature names when configured, and everything degrades honestly.
 */
import type { IntelligenceResponseEnvelope } from "./intelligence-response.js";
import type { Store } from "./index.js";

/** Coarse tiers so agents can branch without parsing raw scores. */
export type FeatureLevel = "unknown" | "low" | "medium" | "high";

export const FEATURE_LEVELS: readonly FeatureLevel[] = ["unknown", "low", "medium", "high"];

/** Where a feature signal came from — auditable per evidence item. */
export type FeatureEvidenceSource = "reviews" | "description" | "metadata" | "screenshots";

export interface FeatureGapEvidence {
  source: FeatureEvidenceSource;
  appId: string | null;
  appName: string | null;
  text: string;
}

/** One feature's position across the competitor set. */
export interface FeatureGap {
  /** Plain-language feature name (LLM-sharpened when enriched; lexicon label otherwise). */
  feature: string;
  /** Fraction of the resolved competitor set whose listing offers it, 0..1. */
  coverage: number;
  /** Number of competitors offering it. */
  competitorCount: number;
  /** Mean sentiment of linked review mentions → quality of existing implementations. */
  quality: FeatureLevel;
  /** Strength of user demand from linked request/complaint/bug themes. */
  demand: FeatureLevel;
  /** True when this is a genuine whitespace gap (see `gapReason`). */
  gap: boolean;
  /** Which conditions fired (or why not a gap) — never an unexplained boolean. */
  gapReason: string;
  /** True when this is a must-have the field already covers well. */
  tableStakes: boolean;
  /** 0..1 — driven by competitor-set size and linked review volume. */
  confidence: number;
  evidence: FeatureGapEvidence[];
}

/** Per-app coverage of the competitor set — honest reporting of what was analyzed. */
export interface FeatureGapAppCoverage {
  appId: string;
  appName: string;
  /** Whether this app carried a usable listing description for extraction. */
  hasDescription: boolean;
  /** Features detected in this app's listing. */
  featureCount: number;
}

export type FeatureGapEnrichment = "llm" | "deterministic";

/** `data` payload of a `feature_gaps` response. */
export interface FeatureGapsData {
  query: string | null;
  country: string;
  appIds: string[];
  /** Reviews that fed the demand signal (via the cluster_reviews service). */
  reviewsAnalyzed: number;
  coverage: FeatureGapAppCoverage[];
  /** The matrix, ranked: strong gaps first, then by demand, then coverage. */
  features: FeatureGap[];
  /** Convenience partitions (ids into `features`, i.e. the same objects). */
  gaps: FeatureGap[];
  tableStakes: FeatureGap[];
  enrichment: FeatureGapEnrichment;
}

/** Request body for `find_feature_gaps`. Provide `query` OR `appIds`. */
export interface FindFeatureGapsRequest {
  query?: string;
  appIds?: string[];
  country?: string;
  /** Max apps in the competitor set (default 10, max 25). */
  limitApps?: number;
  /** Pull demand/quality from review themes (default true). */
  includeReviewSignals?: boolean;
  /** Extract coverage from listing descriptions (default true). */
  includeDescriptionSignals?: boolean;
  /** Only return features at/above this demand tier. */
  minDemand?: Exclude<FeatureLevel, "unknown">;
  /** Restrict competitor discovery to one store (query mode only). */
  store?: Store;
}

export type FeatureGapsIntelligenceResponse = IntelligenceResponseEnvelope<
  FeatureGapsData,
  "feature_gaps"
>;

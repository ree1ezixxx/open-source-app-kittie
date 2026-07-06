/**
 * Shared intelligence response contracts.
 *
 * These are transport shapes for API, CLI, MCP, reports, and web surfaces.
 * Concrete endpoints can add domain-specific `data`, but the evidence,
 * confidence, caveats, and metadata envelope stays stable.
 */
import type { CoverageStatus, Freshness, PresentKind } from "./provenance.js";

export const INTELLIGENCE_CONTRACT_VERSION = "2026-07-01";

export type IntelligenceResponseType =
  | "app_detail"
  | "compare_apps"
  | "trends"
  | "idea_validation"
  | "teardown"
  | "similar"
  | "review_clusters"
  | "feature_gaps"
  | "report";

export type IntelligenceStatus = "ok" | "partial" | "insufficient";

export type IntelligenceSourceType =
  | "app_store"
  | "google_play"
  | "snapshot"
  | "review"
  | "keyword"
  | "meta_ads"
  | "apple_search_ads"
  | "creator"
  | "model"
  | "user_input"
  | "report";

export interface IntelligenceEvidenceSource {
  type: IntelligenceSourceType;
  id: string;
  url: string | null;
}

export interface IntelligenceEvidenceMetric {
  name: string;
  value: string | number | boolean | null;
  unit: string | null;
}

export interface IntelligenceEvidence {
  id: string;
  claim: string;
  source: IntelligenceEvidenceSource;
  /** `modelled` covers Estimated metrics such as revenue, downloads, and Growth score. */
  valueKind: PresentKind;
  sourceStatus: CoverageStatus;
  freshness: Freshness;
  observedAt: string | null;
  metric: IntelligenceEvidenceMetric | null;
}

export type IntelligenceConfidenceLabel =
  | "high"
  | "medium"
  | "low"
  | "insufficient";

export interface IntelligenceConfidence {
  /** 0..1. */
  score: number;
  label: IntelligenceConfidenceLabel;
  reasons: string[];
}

export type IntelligenceCaveatKind =
  | "missing_source"
  | "partial_source"
  | "stale_source"
  | "weak_evidence"
  | "estimated_metric";

export interface IntelligenceCaveat {
  kind: IntelligenceCaveatKind;
  sourceType: IntelligenceSourceType | null;
  message: string;
}

export interface IntelligenceResponseMetadata {
  contractVersion: typeof INTELLIGENCE_CONTRACT_VERSION;
  generatedAt: string;
  sourceQuery: Record<string, string | number | boolean | null>;
  snapshotId: string | null;
  chartCountry: string | null;
  growthPeriod: string | null;
  modelVersion: string | null;
}

export interface IntelligenceResponseEnvelope<
  TData,
  TType extends IntelligenceResponseType = IntelligenceResponseType,
> {
  responseType: TType;
  status: IntelligenceStatus;
  data: TData;
  evidence: IntelligenceEvidence[];
  confidence: IntelligenceConfidence;
  caveats: IntelligenceCaveat[];
  metadata: IntelligenceResponseMetadata;
}

export interface TrendAppMovement {
  reviewGrowth: number | null;
  reviewGrowthPct: number | null;
  rankDelta: number | null;
  growthScore: number | null;
}

export interface TrendAppResult {
  rank: number;
  appId: string;
  store: string;
  title: string;
  developer: string;
  category: string | null;
  rating: number | null;
  reviewCount: number;
  movement: TrendAppMovement;
  evidenceIds: string[];
}

export interface TrendsResponseData {
  category: string | null;
  country: string;
  growthPeriod: string;
  limit: number;
  snapshotDate: string | null;
  apps: TrendAppResult[];
}

export type ReportFormat = "json" | "markdown" | "html";

export type ReportStatus = "queued" | "running" | "complete" | "partial" | "failed";

export interface IntelligenceReportContract<TOutput = unknown> {
  reportId: string;
  template: string;
  format: ReportFormat;
  status: ReportStatus;
  sourceQuery: Record<string, string | number | boolean | null>;
  evidenceSnapshot: {
    generatedAt: string;
    evidence: IntelligenceEvidence[];
    caveats: IntelligenceCaveat[];
    confidence: IntelligenceConfidence;
  };
  output: TOutput | null;
  outputMetadata: {
    title: string;
    generatedAt: string | null;
    expiresAt: string | null;
  };
}

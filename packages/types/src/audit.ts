import type { GrowthPeriod, Store } from "./index.js";

export type SourceStatus = "available" | "partial" | "unavailable";

export type ConfidenceLabel = "High" | "Medium" | "Low" | "Experimental";

export interface ConfidenceScore {
  value: number;
  label: ConfidenceLabel;
}

export interface AuditMetricInput {
  label: string;
  value: number | string | null;
  unit?: "count" | "rank" | "score" | "date" | "percent";
  sourceStatus: SourceStatus;
}

export interface SubScore {
  name: string;
  value: number | null;
  inputs: AuditMetricInput[];
}

export interface EvidenceCard {
  id: string;
  title: string;
  summary: string;
  sourceStatus: SourceStatus;
  observedAt: string | null;
  inputs: AuditMetricInput[];
}

export interface AuditReport {
  app: {
    id: string;
    store: Store;
    storeAppId: string;
    title: string;
    developer: string;
    iconUrl: string | null;
    category: string | null;
  };
  period: GrowthPeriod;
  generatedAt: string;
  confidence: ConfidenceScore;
  subScores: SubScore[];
  evidence: EvidenceCard[];
}

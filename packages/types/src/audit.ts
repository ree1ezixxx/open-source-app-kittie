// Audit Engine contract (epic #168, slice #170).
// An AuditReport answers "what can I build from this?" for one app/category:
// visible sub-scores + a confidence read + traceable evidence cards.
// Honesty rule: a missing source ⇒ lower confidence / SourceStatus, NEVER a
// fabricated value (see docs/adr/0012 + the repo Provenanced<T> contract).

import type { Freshness } from "./provenance.js";

/** Whether the data behind a score/card is fully present, thin, or absent. */
export type SourceStatus = "available" | "partial" | "unavailable";

export type SubScoreName =
  | "momentum"
  | "demand"
  | "pain"
  | "monetisation"
  | "buildability";

/** One visible dimension of the audit. `value` is null when unavailable. */
export interface SubScore {
  name: SubScoreName;
  label: string;
  value: number | null; // 0..100
  sourceStatus: SourceStatus;
  /** The raw signals that fed this score, for traceability/drawer display. */
  inputs: Record<string, number | string | boolean | null>;
  note?: string;
}

export type ConfidenceLabel = "High" | "Medium" | "Low" | "Experimental";

/** How reliable the audit read is — derived, never asserted. */
export interface ConfidenceScore {
  value: number; // 0..1
  label: ConfidenceLabel;
  reasons: string[];
  coverage: number; // 0..1 — fraction of expected sources present
  sampleSize: number;
  freshness: Freshness;
  agreement: number; // 0..1 — cross-signal agreement
}

export type EvidenceKind =
  | "momentum"
  | "demand"
  | "pain"
  | "monetisation"
  | "competitor"
  | "keyword"
  | "ad";

/** Per-signal availability, surfaced as badges so missing data is explicit
 *  (e.g. "ads: unavailable") rather than silently scored as zero (#171). */
export interface SourceSummary {
  key: string;
  label: string;
  status: SourceStatus;
  note?: string;
}

/** A recurring user-pain theme mined from reviews (#172). Each is a buildable
 *  angle: a concentrated complaint is an opportunity. */
export interface PainCluster {
  theme: string;
  frequency: number; // # of analysed reviews mentioning it
  share: number; // 0..1 of analysed reviews
  negativeShare: number; // 0..1 of mentions from low-rating (≤3) reviews
  exampleReviews: string[];
  opportunity: string;
}

/** A single traceable piece of evidence behind the recommendation. */
export interface EvidenceCard {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  sourceStatus: SourceStatus;
  sourceId?: string | null;
  observedAt?: string | null;
}

/** The full audit for one app. Grows slice by slice (more scores/evidence). */
export interface AuditReport {
  appId: string;
  appName: string;
  category: string | null;
  iconUrl?: string | null;
  generatedAt: string; // ISO
  scores: SubScore[];
  confidence: ConfidenceScore;
  sources: SourceSummary[];
  evidence: EvidenceCard[];
  painClusters?: PainCluster[];
}

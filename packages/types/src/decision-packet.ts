/**
 * The decision packet — the canonical machine-readable object every *strategic*
 * Kittie tool returns (never bare prose). This module declares the shared shape
 * only; the builder that constructs and validates one lives in
 * `@kittie/intelligence` (lane L2, epic #97).
 */
import type { PresentKind } from "./provenance.js";

/** What kind of evidence backs a claim — a *present* `ValueKind` (never `missing`). */
export type EvidenceValueType = PresentKind;

/** One supporting fact behind a decision. */
export interface Evidence {
  claim: string;
  valueType: EvidenceValueType;
  sourceId: string;
  /** Canonical URL so clients can cite it; null when not URL-addressable. */
  sourceUrl: string | null;
  /** ISO-8601 instant the evidence was observed. */
  observedAt: string;
}

export interface Confidence {
  /** 0..1. */
  score: number;
  reasons: string[];
}

/** How complete the evidence base was for this decision. */
export type DecisionCoverageStatus = "full" | "partial" | "none";

export interface DecisionCoverage {
  status: DecisionCoverageStatus;
  /** Named inputs that were unavailable, e.g. `"Meta advertising data"`. */
  missing: string[];
}

export interface RecommendedAction {
  /** The Kittie tool to call next. */
  tool: string;
  reason: string;
  /** Estimated cost in the billing unit (see lane L8). */
  estimatedCost: number;
}

/**
 * The canonical decision object. Distinguishes observed fact from modelled,
 * derived and inferred evidence; states what was missing; and recommends the
 * next tool — so an agent can reason about *why* and chain deterministically.
 */
export interface DecisionPacket {
  decision: string;
  evidence: Evidence[];
  confidence: Confidence;
  coverage: DecisionCoverage;
  assumptions: string[];
  unknowns: string[];
  recommendedActions: RecommendedAction[];
  /** Ties the packet to the market snapshot it was reasoned from. */
  snapshotId: string;
}

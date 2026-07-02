/**
 * Cross-format helpers so evidence, confidence, and caveats read identically in
 * Markdown and HTML. JSON emits the raw contract objects instead.
 */
import type {
  IntelligenceCaveat,
  IntelligenceConfidence,
  IntelligenceEvidence,
} from "@kittie/types";

/** Deterministic — no clock reads, so golden tests stay stable. */
export function formatConfidence(confidence: IntelligenceConfidence): string {
  return `${confidence.label} (${confidence.score.toFixed(2)})`;
}

export function formatEvidenceLine(evidence: IntelligenceEvidence): string {
  const source = `${evidence.source.type}:${evidence.source.id}`;
  const tags = [evidence.valueKind, evidence.sourceStatus, evidence.freshness].join(", ");
  const metric = evidence.metric
    ? ` [${evidence.metric.name}=${formatMetricValue(evidence.metric.value)}${
        evidence.metric.unit ? ` ${evidence.metric.unit}` : ""
      }]`
    : "";
  return `${evidence.claim} — ${source} (${tags})${metric}`;
}

export function formatCaveatLine(caveat: IntelligenceCaveat): string {
  const scope = caveat.sourceType ? `${caveat.kind}/${caveat.sourceType}` : caveat.kind;
  return `${scope}: ${caveat.message}`;
}

function formatMetricValue(value: string | number | boolean | null): string {
  return value === null ? "—" : String(value);
}

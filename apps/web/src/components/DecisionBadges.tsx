import type { Confidence, DecisionCoverage } from "@kittie/types";
import { IconInfo } from "../icons";

/** Plain-language confidence band from the 0..1 score. */
export function confidenceLabel(score: number): string {
  if (score >= 0.75) return "High";
  if (score >= 0.5) return "Moderate";
  if (score >= 0.3) return "Low";
  return "Very low";
}

/** Tone drives the dot/text colour: accent for high, amber for mid, muted for low. */
function tone(score: number): "high" | "mid" | "low" {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "mid";
  return "low";
}

/**
 * Confidence badge — shows the real computed score (% + band) and surfaces the
 * model's own reasons on hover. Never decorative: the number is the packet's
 * `confidence.score`, not a UI invention.
 */
export function ConfidenceBadge({
  confidence,
  compact = false,
}: {
  confidence: Confidence;
  compact?: boolean;
}) {
  const pct = Math.round(confidence.score * 100);
  const title = confidence.reasons.length ? confidence.reasons.join(" · ") : undefined;
  return (
    <span className={`conf-badge tone-${tone(confidence.score)}`} title={title}>
      <span className="conf-dot" />
      {pct}% <span className="conf-word">{confidenceLabel(confidence.score)}</span>
      {!compact && <span className="conf-tail">confidence</span>}
    </span>
  );
}

const COVERAGE_WORD: Record<DecisionCoverage["status"], string> = {
  full: "Full coverage",
  partial: "Partial coverage",
  none: "No coverage",
};

/**
 * Coverage badge — honest completeness of the evidence base. `partial`/`none`
 * are collection states, never a silent gap; the missing sources show on hover.
 */
export function CoverageBadge({
  coverage,
  compact = false,
}: {
  coverage: DecisionCoverage;
  compact?: boolean;
}) {
  const t = coverage.status === "full" ? "high" : coverage.status === "partial" ? "mid" : "low";
  const title = coverage.missing.length ? `Missing: ${coverage.missing.join(", ")}` : undefined;
  return (
    <span className={`cov-badge tone-${t}`} title={title}>
      {COVERAGE_WORD[coverage.status]}
      {!compact && coverage.missing.length > 0 && <IconInfo />}
    </span>
  );
}

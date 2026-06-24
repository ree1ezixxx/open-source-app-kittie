import type { Confidence, DecisionCoverage, Freshness } from "@kittie/types";
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
  // threshold on the rounded percent so the displayed % and the band/tone never disagree
  const rounded = pct / 100;
  const title = confidence.reasons.length ? confidence.reasons.join(" · ") : undefined;
  return (
    <span className={`conf-badge tone-${tone(rounded)}`} title={title}>
      <span className="conf-dot" />
      {pct}% <span className="conf-word">{confidenceLabel(rounded)}</span>
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

/** Derive a freshness band from an ISO date — daily snapshots: ≤2d fresh, ≤7d aging. */
export function freshnessFromDate(iso: string | null): Freshness {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 0) return "unknown"; // future-dated snapshot is not "fresh"
  return days <= 2 ? "fresh" : days <= 7 ? "aging" : "stale";
}

const FRESH_WORD: Record<Freshness, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  unknown: "Unknown age",
};

/**
 * Freshness badge — how recent the underlying snapshot is. Honest: derived from
 * the real latest-snapshot date, shown alongside it; `unknown` when undated.
 */
export function FreshnessBadge({ date }: { date: string | null }) {
  const label = freshnessFromDate(date);
  const t = label === "fresh" ? "high" : label === "aging" ? "mid" : "low";
  // parse YYYY-MM-DD as UTC (it's stored as UTC) so users west of UTC don't see the day before;
  // only render a date when it actually parsed (avoids an "Invalid Date" suffix).
  const human =
    label !== "unknown" && date
      ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
      : null;
  return (
    <span className={`fresh-badge tone-${t}`} title={date ? `Latest snapshot ${date}` : "No snapshot date"}>
      {FRESH_WORD[label]}
      {human ? ` · ${human}` : ""}
    </span>
  );
}

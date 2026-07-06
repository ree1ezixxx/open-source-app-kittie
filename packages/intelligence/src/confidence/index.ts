/**
 * Confidence calibration (#273) — ONE documented model for every decision-ladder
 * response, replacing per-primitive ad-hoc arithmetic. The spec (with worked
 * examples that MUST reproduce this code's numbers) lives at
 * docs/contracts/confidence-calibration.md.
 *
 * Hard rules (property-tested):
 * - No primary evidence → { score: 0, label: "insufficient" }. Always.
 * - More evidence never lowers the score; a locale mismatch never raises it.
 * - The score is reproducible from the response's own sourceCoverage block —
 *   an agent can audit it.
 * - Ceiling 0.9: a heuristic pipeline is never certain.
 * - `missing_source` caps applied later by buildIntelligenceResponse still
 *   stand — this model feeds that gate, it does not replace it.
 *
 * Model (v1):
 *   score = min(0.9, 0.35                     — base: primitive ran on real evidence
 *                + 0.30 · volume              — evidenceUnits / evidenceTarget, capped 1
 *                + 0.20 · spread              — appsContributing / appsResolved
 *                + 0.05 · recency             — fraction of evidence ≤180d old (0 when unknown)
 *                + 0.05 · diversity           — sourceTypesPresent / sourceTypesConsulted
 *                + 0.05 · llm                 — enrichment seam succeeded)
 *           − 0.10 · localeMismatch           — requested market absent from localesSeen
 *   rounded to 3dp, floored at 0.05 (evidence exists, however thin).
 * Labels (#180 thresholds): ≥0.75 high · ≥0.6 medium · >0 low · 0 insufficient.
 */
import type { IntelligenceConfidence } from "@kittie/types";

export const CONFIDENCE_MODEL = {
  base: 0.35,
  weights: { volume: 0.3, spread: 0.2, recency: 0.05, diversity: 0.05, llm: 0.05 },
  localeMismatchPenalty: 0.1,
  ceiling: 0.9,
  floor: 0.05,
  /** Evidence within this window counts as recent. */
  recentWindowDays: 180,
} as const;

export interface CalibrationInput {
  /** Primary evidence units the answer actually analyzed (e.g. reviews). */
  evidenceUnits: number;
  /** Units at which volume saturates (per-primitive; e.g. 100 reviews). */
  evidenceTarget: number;
  /** Apps that contributed ≥1 unit. */
  appsContributing: number;
  /** Apps in the resolved set. */
  appsResolved: number;
  /** Fraction of units ≤ recentWindowDays old; null when dates are unknown. */
  recentFraction?: number | null;
  /** Source types that actually contributed / were consulted (diversity). */
  sourceTypesPresent: number;
  sourceTypesConsulted: number;
  /** LLM enrichment seam succeeded for this response. */
  llmEnriched: boolean;
  /** Requested storefront vs locales actually observed; both optional. */
  requestedLocale?: string | null;
  localesSeen?: string[];
  /** Prepended, primitive-specific reasons (kept ahead of model reasons). */
  extraReasons?: string[];
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function labelForConfidence(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

/** True when the requested market is absent from the locales actually observed. */
export function isLocaleMismatch(requestedLocale: string | null | undefined, localesSeen: string[] | undefined): boolean {
  if (!requestedLocale || !localesSeen || localesSeen.length === 0) return false; // unknown ≠ mismatch
  return !localesSeen.map((l) => l.toUpperCase()).includes(requestedLocale.toUpperCase());
}

/**
 * The calibration function. Deterministic, auditable: every non-zero factor
 * lands in `reasons` with its inputs, so an agent can reproduce the score from
 * the response's own sourceCoverage.
 */
export function calibrateConfidence(input: CalibrationInput): IntelligenceConfidence {
  if (input.evidenceUnits <= 0) {
    return {
      score: 0,
      label: "insufficient",
      reasons: [...(input.extraReasons ?? []), "No primary evidence analysed."],
    };
  }
  const M = CONFIDENCE_MODEL;
  const volume = clamp01(input.evidenceUnits / Math.max(input.evidenceTarget, 1));
  const spread = clamp01(input.appsContributing / Math.max(input.appsResolved, 1));
  // Recency scales with volume (recentUnits/target, not a bare fraction) — the
  // golden honesty suite proved the bare fraction rewards DISCARDING old
  // evidence (cap the corpus to its newest rows → fraction 1.0 → score up).
  const recency = input.recentFraction == null ? 0 : clamp01(input.recentFraction) * volume;
  const diversity = clamp01(input.sourceTypesPresent / Math.max(input.sourceTypesConsulted, 1));
  const llm = input.llmEnriched ? 1 : 0;
  const mismatch = isLocaleMismatch(input.requestedLocale, input.localesSeen);

  const raw =
    M.base +
    M.weights.volume * volume +
    M.weights.spread * spread +
    M.weights.recency * recency +
    M.weights.diversity * diversity +
    M.weights.llm * llm -
    (mismatch ? M.localeMismatchPenalty : 0);
  const score = round3(Math.min(M.ceiling, Math.max(M.floor, raw)));

  const reasons = [
    ...(input.extraReasons ?? []),
    `volume ${input.evidenceUnits}/${input.evidenceTarget} → ${round3(M.weights.volume * volume)}`,
    `spread ${input.appsContributing}/${input.appsResolved} apps → ${round3(M.weights.spread * spread)}`,
  ];
  if (input.recentFraction != null)
    reasons.push(
      `recency ${Math.round(clamp01(input.recentFraction) * 100)}% ≤${M.recentWindowDays}d (×volume) → ${round3(M.weights.recency * recency)}`,
    );
  else reasons.push("recency unknown → 0");
  reasons.push(`source diversity ${input.sourceTypesPresent}/${input.sourceTypesConsulted} → ${round3(M.weights.diversity * diversity)}`);
  reasons.push(input.llmEnriched ? "LLM enrichment succeeded → +0.05" : "LLM enrichment unavailable → 0");
  if (mismatch) reasons.push(`locale mismatch (${input.requestedLocale} not in [${(input.localesSeen ?? []).join(",")}]) → −${M.localeMismatchPenalty}`);

  return { score, label: labelForConfidence(score), reasons };
}

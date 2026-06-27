import type { ConfidenceScore, ConfidenceLabel, Freshness } from "@kittie/types";

// Confidence is DERIVED, never asserted (epic #168). A read is trustworthy when
// it draws on many sources, a large sample, fresh data, and signals that agree.
// Missing sources lower THIS, not the underlying value (docs/adr/0012).

export interface ConfidenceInput {
  /** How many of the expected sources actually produced data. */
  sourcesPresent: number;
  sourcesExpected: number;
  /** Underlying observation count (e.g. review count, mentions). */
  sampleSize: number;
  freshness: Freshness;
  /** 0..1 cross-signal agreement; omit when unknown (treated as neutral). */
  agreement?: number;
}

const FRESH_FACTOR: Record<Freshness, number> = {
  fresh: 1,
  aging: 0.7,
  stale: 0.4,
  unknown: 0.3,
};

const SAMPLE_FULL = 200; // sample at/above which the sample factor saturates

const WEIGHTS = { coverage: 0.4, sample: 0.25, freshness: 0.2, agreement: 0.15 };

export function computeConfidence(input: ConfidenceInput): ConfidenceScore {
  const coverage =
    input.sourcesExpected > 0
      ? clamp01(input.sourcesPresent / input.sourcesExpected)
      : 0;

  const sampleFactor =
    input.sampleSize <= 0
      ? 0
      : clamp01(Math.log10(input.sampleSize + 1) / Math.log10(SAMPLE_FULL + 1));

  const freshnessFactor = FRESH_FACTOR[input.freshness] ?? 0.3;
  const agreement = clamp01(input.agreement ?? 0.6);

  const value = clamp01(
    WEIGHTS.coverage * coverage +
      WEIGHTS.sample * sampleFactor +
      WEIGHTS.freshness * freshnessFactor +
      WEIGHTS.agreement * agreement,
  );

  const reasons: string[] = [];
  if (coverage < 1)
    reasons.push(`${input.sourcesPresent}/${input.sourcesExpected} sources available`);
  if (sampleFactor < 0.5) reasons.push(`thin sample (n=${input.sampleSize})`);
  if (freshnessFactor < 1) reasons.push(`data is ${input.freshness}`);
  if (agreement < 0.6) reasons.push("signals partly disagree");
  if (reasons.length === 0) reasons.push("broad, fresh, agreeing signals");

  return {
    value: round2(value),
    label: labelFor(value),
    reasons,
    coverage: round2(coverage),
    sampleSize: input.sampleSize,
    freshness: input.freshness,
    agreement: round2(agreement),
  };
}

function labelFor(v: number): ConfidenceLabel {
  if (v >= 0.75) return "High";
  if (v >= 0.5) return "Medium";
  if (v >= 0.3) return "Low";
  return "Experimental";
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

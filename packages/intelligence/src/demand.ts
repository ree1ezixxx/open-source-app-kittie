/**
 * Composite demand signal (lane L4, epic #97). Folds many market inputs into one
 * 0–100 score. Advertising is ONE nullable input that NEVER gates the score —
 * when the ad source is unavailable it surfaces as `hasMetaAds: null`, never
 * `false`. Absent inputs are excluded from the weighted mean, never zeroed.
 */
import type { CoverageStatus } from "@kittie/types";
import { mergeCoverage } from "@kittie/core";

export interface DemandSignalInput {
  /** Each input is a 0–100 sub-score; null/undefined = unavailable (excluded). */
  reviewVelocity?: number | null;
  chartPersistence?: number | null;
  rankMomentum?: number | null;
  keywordDemand?: number | null;
  releaseCadence?: number | null;
  publisherStrength?: number | null;
  monetizationPresence?: number | null;
  geographicBreadth?: number | null;
  featuredPlacements?: number | null;
  /** Ad-creative count where available; NULL when the ad source is unavailable. */
  advertising?: number | null;
}

export interface DemandComponent {
  key: string;
  value: number;
  weight: number;
}

export interface DemandSignal {
  /** 0–100 composite over the inputs that were available. */
  score: number;
  components: DemandComponent[];
  /** Input keys that were unavailable — excluded from the score, never zeroed. */
  missing: string[];
  /** Coverage of the core inputs (advertising is tracked separately in `ads`). */
  coverage: CoverageStatus;
  /** Advertising never gates the score; unavailable is `null`, never `false`. */
  ads: { hasMetaAds: boolean | null; status: string };
}

/** Core weighted inputs (advertising is deliberately NOT here — it never gates). */
const WEIGHTS: Record<string, number> = {
  reviewVelocity: 0.22,
  chartPersistence: 0.16,
  rankMomentum: 0.16,
  keywordDemand: 0.16,
  publisherStrength: 0.1,
  monetizationPresence: 0.08,
  geographicBreadth: 0.07,
  releaseCadence: 0.05,
  featuredPlacements: 0.05,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function computeDemandSignal(input: DemandSignalInput): DemandSignal {
  const components: DemandComponent[] = [];
  const missing: string[] = [];
  const statuses: CoverageStatus[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const raw = input[key as keyof DemandSignalInput];
    if (raw == null) {
      missing.push(key);
      statuses.push("source_omitted");
      continue;
    }
    const value = clamp(raw);
    components.push({ key, value, weight });
    weightedSum += value * weight;
    weightTotal += weight;
    statuses.push("ok");
  }

  // Advertising: a signal, but never a gate. Excluded from `coverage` roll-up.
  const adv = input.advertising;
  if (adv == null) {
    missing.push("advertising");
  } else {
    const value = clamp(adv);
    const weight = 0.05;
    components.push({ key: "advertising", value, weight });
    weightedSum += value * weight;
    weightTotal += weight;
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 0;

  const ads =
    adv == null
      ? { hasMetaAds: null, status: "not_available_in_requested_market" }
      : { hasMetaAds: adv > 0, status: "observed" };

  return { score, components, missing, coverage: mergeCoverage(statuses), ads };
}

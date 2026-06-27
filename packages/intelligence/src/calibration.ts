import type { SourceStatus } from "@kittie/types";

// Monetisation scoring + Google Play install-bucket calibration (#173).
// Pure + deterministic. Play install ranges are FREE and REAL — we use them to
// anchor (calibrate) the Apple-side modelled download estimate, and to compute a
// Monetisation sub-score. All outputs stay labelled modelled/calibrated, never
// presented as ground truth (docs/adr + honesty contract).

export interface InstallRange {
  min: number;
  max: number | null; // null for open-ended "1,000,000+"
}

/** Parse a Google Play install bucket: "1,000,000+", "1M+", "100K - 500K". */
export function parseInstallBucket(raw: string | null | undefined): InstallRange | null {
  if (!raw) return null;
  const norm = raw.toLowerCase().replace(/,/g, "").trim();
  const num = (t: string): number | null => {
    const m = t.match(/^([\d.]+)\s*([km]?)\+?$/);
    if (!m) return null;
    const n = parseFloat(m[1]!);
    if (Number.isNaN(n)) return null;
    const mult = m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1;
    return Math.round(n * mult);
  };
  const rangeParts = norm.split(/\s*[-–]\s*/);
  if (rangeParts.length === 2) {
    const min = num(rangeParts[0]!);
    const max = num(rangeParts[1]!);
    if (min == null) return null;
    return { min, max: max ?? null };
  }
  const min = num(norm);
  if (min == null) return null;
  return { min, max: norm.includes("+") ? null : min };
}

export interface MonetisationInput {
  modelledRevenueUsd: number; // from estimateRevenue(signals)
  modelledDownloads: number; // from estimateDownloads(signals, rev)
  iapCount: number;
  price?: number | null;
  hasSubscription?: boolean;
  installBucket?: string | null; // Google Play, when available
}

export interface MonetisationResult {
  score: number | null; // 0..100
  sourceStatus: SourceStatus;
  calibrated: boolean;
  calibratedDownloads: number | null;
  note?: string;
  inputs: Record<string, number | string | boolean | null>;
}

// An active app's MONTHLY downloads plausibly sit between these fractions of its
// LIFETIME Play install base — used to clamp the Apple-modelled monthly estimate.
const MONTHLY_FLOOR_FRAC = 0.001;
const MONTHLY_CEIL_FRAC = 0.05;
const REVENUE_SATURATION = 100_000; // $/mo at which the revenue factor saturates

export function computeMonetisation(input: MonetisationInput): MonetisationResult {
  const rev = Math.max(0, input.modelledRevenueUsd);
  const range = parseInstallBucket(input.installBucket);

  // Calibrate the monthly download estimate against real Play install scale.
  let calibratedDownloads: number | null = null;
  let calibrated = false;
  if (range) {
    const floor = range.min * MONTHLY_FLOOR_FRAC;
    const ceil = (range.max ?? range.min) * MONTHLY_CEIL_FRAC;
    calibratedDownloads = Math.round(clamp(input.modelledDownloads, floor, Math.max(floor, ceil)));
    calibrated = true;
  }

  const revenueFactor = clamp01(Math.log10(rev + 1) / Math.log10(REVENUE_SATURATION + 1));
  const iapFactor = clamp01(input.iapCount / 6);
  const modelFactor = clamp01(
    (input.hasSubscription ? 0.6 : 0) +
      (input.price && input.price > 0 ? 0.2 : 0) +
      (input.iapCount > 0 ? 0.2 : 0),
  );

  const hasAnySignal = rev > 0 || input.iapCount > 0 || (input.price ?? 0) > 0;
  const sourceStatus: SourceStatus = !hasAnySignal ? "partial" : "available";
  const score = hasAnySignal
    ? Math.round(100 * clamp01(0.6 * revenueFactor + 0.2 * iapFactor + 0.2 * modelFactor))
    : null;

  const note = calibrated
    ? `Modelled, calibrated to Google Play installs (${input.installBucket})`
    : "Modelled from Apple signals — no Play install data yet";

  return {
    score,
    sourceStatus,
    calibrated,
    calibratedDownloads,
    note,
    inputs: {
      revenueUsdPerMo: Math.round(rev),
      downloadsPerMo: calibratedDownloads ?? Math.round(input.modelledDownloads),
      iapCount: input.iapCount,
      calibrated,
    },
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

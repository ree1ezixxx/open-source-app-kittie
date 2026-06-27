// Buildability scorer (#174). Can an indie/agency ship a credible wedge FAST?
// Pure + deterministic from category + monetisation surface. Higher = easier.
// Drivers (each lowers buildability): regulatory risk, asset burden, feature
// complexity, platform/hardware dependency.

export interface BuildabilityInput {
  category: string | null;
  iapCount: number;
}

export interface BuildabilityResult {
  score: number; // 0..100, higher = easier to build a wedge
  factors: {
    regulatoryRisk: number; // 0..1
    assetBurden: number; // 0..1
    featureComplexity: number; // 0..1
    platformDependency: number; // 0..1
  };
  note?: string;
}

function matches(cat: string, needles: string[]): boolean {
  return needles.some((n) => cat.includes(n));
}

export function computeBuildability(input: BuildabilityInput): BuildabilityResult {
  const cat = (input.category ?? "").toLowerCase();

  // Regulated/trust-heavy domains take longer to ship credibly.
  const regulatoryRisk = matches(cat, ["financ", "bank", "medical", "health", "insur", "crypto", "trading", "tax"])
    ? 0.75
    : matches(cat, ["kids", "child", "education", "medical"])
      ? 0.45
      : 0.1;

  // Content/asset production cost.
  const assetBurden = matches(cat, ["game"])
    ? 0.8
    : matches(cat, ["photo", "video", "entertainment", "music", "navigation"])
      ? 0.5
      : 0.2;

  // Monetisation/feature surface as a complexity proxy.
  const featureComplexity = clamp01(0.15 + Math.min(input.iapCount / 8, 1) * 0.6);

  // Hardware/platform reliance.
  const platformDependency = matches(cat, ["health", "fitness", "navigation", "ar", "wearable", "watch"])
    ? 0.5
    : 0.15;

  const drag =
    0.35 * regulatoryRisk + 0.3 * assetBurden + 0.25 * featureComplexity + 0.1 * platformDependency;
  const score = Math.round(100 * clamp01(1 - drag));

  return {
    score,
    factors: { regulatoryRisk, assetBurden, featureComplexity, platformDependency },
    note: input.category ? undefined : "No category — buildability is a rough estimate",
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

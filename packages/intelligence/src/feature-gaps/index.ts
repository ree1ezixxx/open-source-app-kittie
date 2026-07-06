/**
 * find_feature_gaps synthesis (#260). Pure, I/O-free functions that cross a
 * competitor set's listing-declared features (what they OFFER) against user
 * demand mined from `cluster_reviews` themes (what users WANT), then separate
 * table-stakes from genuine whitespace gaps and wrap the matrix in the canonical
 * #180 envelope.
 *
 * DETERMINISTIC base: a curated cross-category FEATURE_LEXICON is matched against
 * each app's listing description (→ coverage) and against the review themes'
 * names + quote text (→ demand + quality). It never fabricates — a feature with
 * no listing and no review signal simply isn't a candidate.
 *
 * The API service owns the optional LLM seam: it may rename/merge features (the
 * category-specific name behind a generic bucket). Coverage/demand counts are
 * never touched by the model.
 */
import {
  INTELLIGENCE_CONTRACT_VERSION,
  type FeatureGap,
  type FeatureGapAppCoverage,
  type FeatureGapEnrichment,
  type FeatureGapEvidence,
  type FeatureGapsData,
  type FeatureGapsIntelligenceResponse,
  type FeatureLevel,
  type FindFeatureGapsRequest,
  type IntelligenceCaveat,
  type IntelligenceConfidence,
  type IntelligenceEvidence,
  type ReviewTheme,
} from "@kittie/types";
import { buildIntelligenceResponse, type MissingIntelligenceSource } from "../intelligence-response.js";

export const FEATURE_GAP_DEFAULTS = {
  limitApps: 10,
  maxLimitApps: 25,
  /** Gap threshold: a feature the field barely ships. */
  gapCoverageCeiling: 0.3,
  /** Table-stakes threshold: a feature the field ships well. */
  tableStakesCoverageFloor: 0.7,
  /** Min linked review mentions before quality is anything but "unknown". */
  qualityMinMentions: 5,
  /** Feature-level demand-frequency tier cutoffs (sum of linked request/complaint/bug theme freq). */
  demandHigh: 0.15,
  demandMedium: 0.05,
  maxEvidencePerFeature: 4,
  maxEvidenceFeatures: 12,
  descriptionExcerptLen: 160,
} as const;

/* ---- pure input shapes --------------------------------------------------- */

export interface FeatureInputApp {
  id: string;
  name: string;
  description: string | null;
  category?: string | null;
}

export interface FeatureGapsComputeInput {
  apps: FeatureInputApp[];
  /** Review themes for the SAME set, from the cluster_reviews service. */
  themes: ReviewTheme[];
  params: FindFeatureGapsRequest;
}

export interface FeatureGapsComputed {
  features: FeatureGap[];
  coverage: FeatureGapAppCoverage[];
}

/* ---- feature lexicon (cross-category; LLM adds category-specific names) --- */

interface LexiconEntry {
  feature: string;
  keywords: string[];
}

export const FEATURE_LEXICON: readonly LexiconEntry[] = [
  { feature: "Offline mode", keywords: ["offline", "no internet", "without internet", "works offline"] },
  { feature: "Cross-device sync", keywords: ["sync", "syncing", "cloud sync", "across devices", "icloud", "cross-device", "cross platform", "cross-platform"] },
  { feature: "Dark mode", keywords: ["dark mode", "dark theme", "night mode"] },
  { feature: "Home-screen widgets", keywords: ["widget", "widgets", "home screen widget", "lock screen widget"] },
  { feature: "Reminders & notifications", keywords: ["reminder", "reminders", "notification", "notifications", "push notification", "alerts"] },
  { feature: "Data export", keywords: ["export", "csv", "pdf export", "export data", "download your data"] },
  { feature: "Backup & restore", keywords: ["backup", "back up", "restore", "cloud backup"] },
  { feature: "Apple Watch / wearables", keywords: ["apple watch", "watch app", "wearable", "watchos", "wear os"] },
  { feature: "Sharing & social", keywords: ["share", "sharing", "invite friends", "social", "leaderboard", "community"] },
  { feature: "Customisation & themes", keywords: ["customize", "customise", "themes", "personalize", "personalise", "custom theme"] },
  { feature: "Premium / subscription", keywords: ["premium", "subscription", "pro version", "upgrade to pro", "paywall", "unlock premium"] },
  { feature: "Onboarding & tutorial", keywords: ["onboarding", "tutorial", "getting started", "walkthrough", "guided setup"] },
  { feature: "Search, filter & sort", keywords: ["search", "filter", "sort", "advanced search"] },
  { feature: "Calendar integration", keywords: ["calendar", "google calendar", "sync calendar", "ical"] },
  { feature: "Multi-language / localisation", keywords: ["language", "languages", "translation", "localiz", "localis", "multilingual"] },
  { feature: "Accounts & login", keywords: ["login", "log in", "sign in", "create account", "sign up", "sign-in"] },
  { feature: "Ad-free experience", keywords: ["ad-free", "no ads", "remove ads", "without ads", "ad free"] },
  { feature: "Stats & insights", keywords: ["stats", "statistics", "insights", "analytics", "reports", "charts", "trends", "dashboard"] },
  { feature: "Import from other apps", keywords: ["import", "import data", "import from", "migrate from"] },
  { feature: "Security & privacy lock", keywords: ["password protect", "face id", "touch id", "biometric", "encryption", "privacy lock", "app lock", "passcode"] },
];

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round = (n: number, dp = 3): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const LEVEL_RANK: Record<FeatureLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
const DEMAND_THEME_TYPES = new Set(["request", "complaint", "bug"]);

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

function excerptAround(description: string, keywords: string[]): string {
  const lower = description.toLowerCase();
  let at = -1;
  for (const k of keywords) {
    const i = lower.indexOf(k);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const len = FEATURE_GAP_DEFAULTS.descriptionExcerptLen;
  if (at < 0) return description.slice(0, len).trim();
  const start = Math.max(0, at - 40);
  const raw = description.slice(start, start + len).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${raw}${start + len < description.length ? "…" : ""}`;
}

function demandLevel(freqSum: number): FeatureLevel {
  if (freqSum >= FEATURE_GAP_DEFAULTS.demandHigh) return "high";
  if (freqSum >= FEATURE_GAP_DEFAULTS.demandMedium) return "medium";
  if (freqSum > 0) return "low";
  return "unknown";
}

function qualityLevel(weightedSentiment: number, mentions: number): FeatureLevel {
  if (mentions < FEATURE_GAP_DEFAULTS.qualityMinMentions) return "unknown";
  if (weightedSentiment >= 0.2) return "high";
  if (weightedSentiment >= -0.25) return "medium";
  return "low";
}

/** Build the deterministic feature × competitor matrix. Pure and total. */
export function findFeatureGapsDeterministic(input: FeatureGapsComputeInput): FeatureGapsComputed {
  const { apps, themes, params } = input;
  const useDescriptions = params.includeDescriptionSignals !== false;
  const useReviews = params.includeReviewSignals !== false;
  const totalApps = Math.max(apps.length, 1);

  // Pre-lower descriptions once.
  const appText = apps.map((a) => ({
    app: a,
    text: useDescriptions && a.description ? a.description.toLowerCase() : "",
  }));
  const coverage: FeatureGapAppCoverage[] = apps.map((a) => ({
    appId: a.id,
    appName: a.name,
    hasDescription: Boolean(useDescriptions && a.description && a.description.trim().length > 0),
    featureCount: 0,
  }));
  const coverageByApp = new Map(coverage.map((c) => [c.appId, c]));

  // Pre-lower theme haystacks (name + quotes) once.
  const themeText = (useReviews ? themes : []).map((t) => ({
    theme: t,
    hay: `${t.theme} ${t.quotes.map((q) => q.text).join(" ")}`.toLowerCase(),
  }));

  const minDemandRank = params.minDemand ? LEVEL_RANK[params.minDemand] : 0;

  const features: FeatureGap[] = [];
  for (const entry of FEATURE_LEXICON) {
    // coverage — apps whose listing declares the feature
    const offering = appText.filter((a) => a.text && matchesAny(a.text, entry.keywords)).map((a) => a.app);
    for (const a of offering) {
      const c = coverageByApp.get(a.id);
      if (c) c.featureCount += 1;
    }
    const coverageFrac = offering.length / totalApps;

    // demand + quality — themes whose name/quotes mention the feature
    const matched = themeText.filter((t) => matchesAny(t.hay, entry.keywords)).map((t) => t.theme);
    const demandThemes = matched.filter((t) => DEMAND_THEME_TYPES.has(t.type));
    const demandFreqSum = demandThemes.reduce((s, t) => s + t.freq, 0);
    const demand = demandLevel(demandFreqSum);

    const mentions = matched.reduce((s, t) => s + t.mentionCount, 0);
    const weightedSentiment =
      mentions > 0 ? matched.reduce((s, t) => s + t.sentiment * t.mentionCount, 0) / mentions : 0;
    const quality = qualityLevel(weightedSentiment, mentions);

    // A feature is only a candidate if the market touches it at all.
    if (offering.length === 0 && matched.length === 0) continue;
    if (LEVEL_RANK[demand] < minDemandRank) continue;

    const hasNegativeEvidence = demandThemes.length > 0 || matched.some((t) => t.sentiment < 0);
    const isGap =
      demand === "high" &&
      coverageFrac < FEATURE_GAP_DEFAULTS.gapCoverageCeiling &&
      quality !== "high" &&
      hasNegativeEvidence;
    const isTableStakes =
      coverageFrac >= FEATURE_GAP_DEFAULTS.tableStakesCoverageFloor &&
      (quality === "high" || quality === "medium");

    const gapReason = isGap
      ? `Strong gap: high demand (${demandThemes.length} request/complaint themes), only ${Math.round(coverageFrac * 100)}% of the field ships it, existing quality ${quality}.`
      : isTableStakes
        ? `Table stakes: ${Math.round(coverageFrac * 100)}% of the field ships it at ${quality} quality.`
        : `Not a strong gap — demand ${demand}, coverage ${Math.round(coverageFrac * 100)}%, quality ${quality}.`;

    const confidence = round(
      clamp01(0.3 + Math.min(totalApps / 10, 1) * 0.35 + Math.min(mentions / 20, 1) * 0.35),
      3,
    );

    // evidence: a couple of listing citations + a couple of review quotes
    const evidence: FeatureGapEvidence[] = [];
    for (const a of offering.slice(0, 2)) {
      evidence.push({
        source: "description",
        appId: a.id,
        appName: a.name,
        text: excerptAround(a.description ?? "", entry.keywords),
      });
    }
    for (const t of demandThemes.slice(0, 2)) {
      const q = t.quotes[0];
      evidence.push({
        source: "reviews",
        appId: q?.appId ?? null,
        appName: q?.appName ?? null,
        text: q?.text ?? `${t.theme} — ${t.mentionCount} mentions (${t.type})`,
      });
    }

    features.push({
      feature: entry.feature,
      coverage: round(coverageFrac, 3),
      competitorCount: offering.length,
      quality,
      demand,
      gap: isGap,
      gapReason,
      tableStakes: isTableStakes,
      confidence,
      evidence: evidence.slice(0, FEATURE_GAP_DEFAULTS.maxEvidencePerFeature),
    });
  }

  // Rank: gaps first, then by demand, then coverage, then name (stable).
  features.sort(
    (a, b) =>
      Number(b.gap) - Number(a.gap) ||
      LEVEL_RANK[b.demand] - LEVEL_RANK[a.demand] ||
      b.coverage - a.coverage ||
      a.feature.localeCompare(b.feature),
  );

  return { features, coverage };
}

/* ---- envelope builder ---------------------------------------------------- */

export interface BuildFeatureGapsInput {
  features: FeatureGap[];
  coverage: FeatureGapAppCoverage[];
  reviewsAnalyzed: number;
  /** Propagated from the composed cluster_reviews response (#271); null/[] when reviews were skipped. */
  reviewDateRange?: { oldest: string; newest: string } | null;
  localesSeen?: string[];
  /** Apps that contributed >=1 analyzed review (from the cluster service); null when unknown. */
  appsWithReviews?: number | null;
  apps: FeatureInputApp[];
  params: FindFeatureGapsRequest;
  enrichment: FeatureGapEnrichment;
  generatedAt: string;
  modelVersion?: string | null;
}

function featureEvidence(features: FeatureGap[]): IntelligenceEvidence[] {
  return features.slice(0, FEATURE_GAP_DEFAULTS.maxEvidenceFeatures).map<IntelligenceEvidence>((f, i) => ({
    id: `feature:${f.feature.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "feature"}:${i}`,
    claim: `${f.feature} — coverage ${Math.round(f.coverage * 100)}% (${f.competitorCount} apps), demand ${f.demand}, quality ${f.quality}${f.gap ? " — GAP" : f.tableStakes ? " — table stakes" : ""}`,
    source: { type: f.evidence.some((e) => e.source === "reviews") ? "review" : "model", id: `feature:${i}`, url: null },
    valueKind: "derived",
    sourceStatus: "ok",
    freshness: "unknown",
    observedAt: null,
    metric: { name: "coverage", value: f.coverage, unit: null },
  }));
}

function overallConfidence(input: BuildFeatureGapsInput): IntelligenceConfidence {
  const withDesc = input.coverage.filter((c) => c.hasDescription).length;
  const totalApps = Math.max(input.apps.length, 1);
  if (input.features.length === 0) {
    return {
      score: 0,
      label: "insufficient",
      reasons: ["No listing features or review demand signals for the competitor set."],
    };
  }
  const descFrac = withDesc / totalApps;
  const reviewVol = Math.min(input.reviewsAnalyzed / 100, 1);
  const score = clamp01(Math.min(0.9, 0.35 + descFrac * 0.3 + reviewVol * 0.25 + (input.enrichment === "llm" ? 0.05 : 0)));
  return {
    score: round(score, 3),
    label: score >= 0.75 ? "high" : score >= 0.6 ? "medium" : "low",
    reasons: [
      `${input.features.length} features across ${totalApps} apps (${withDesc} with listings)`,
      input.reviewsAnalyzed > 0
        ? `${input.reviewsAnalyzed} reviews fed the demand signal`
        : "no review demand signal (demand/quality unknown)",
      input.enrichment === "llm" ? "features named by LLM enrichment" : "lexicon feature names (LLM naming unavailable)",
    ],
  };
}

/** Wrap a final feature list (deterministic OR LLM-enriched) into the envelope. */
export function buildFeatureGapsResponse(input: BuildFeatureGapsInput): FeatureGapsIntelligenceResponse {
  const caveats: IntelligenceCaveat[] = [];
  const missingSources: MissingIntelligenceSource[] = [];
  const appsWithoutDesc = input.coverage.filter((c) => !c.hasDescription);

  if (input.reviewsAnalyzed === 0) {
    caveats.push({
      kind: "partial_source",
      sourceType: "review",
      message: "No reviews for the set — demand and implementation-quality are unknown; only listing coverage is grounded.",
    });
  }
  if (input.features.length === 0) {
    missingSources.push({
      sourceType: "model",
      message: "No listing features or review demand matched the competitor set — nothing to map.",
    });
  } else if (appsWithoutDesc.length > 0) {
    caveats.push({
      kind: "partial_source",
      sourceType: "app_store",
      message: `${appsWithoutDesc.length} of ${input.coverage.length} apps have no listing description — their coverage is understated.`,
    });
  }
  if (input.enrichment === "deterministic" && input.features.length > 0) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "model",
      message: "Features are cross-category lexicon buckets; category-specific naming requires the LLM seam (unconfigured).",
    });
  }

  const withDescriptions = input.coverage.filter((c) => c.hasDescription).length;
  const data: FeatureGapsData = {
    query: typeof input.params.query === "string" && input.params.query.trim() ? input.params.query.trim() : null,
    country: input.params.country?.trim() || "US",
    appIds: input.apps.map((a) => a.id),
    reviewsAnalyzed: input.reviewsAnalyzed,
    coverage: input.coverage,
    features: input.features,
    gaps: input.features.filter((f) => f.gap),
    tableStakes: input.features.filter((f) => f.tableStakes),
    enrichment: input.enrichment,
    sourceCoverage: {
      appsResolved: input.apps.length,
      appsWithReviews: input.appsWithReviews ?? 0,
      appsWithDescriptions: withDescriptions,
      reviewsAnalyzed: input.reviewsAnalyzed,
      reviewDateRange: input.reviewDateRange ?? null,
      localesSeen: input.localesSeen ?? [],
      notes: [
        {
          sourceType: "review",
          status: input.reviewsAnalyzed === 0 ? "missing" : "ok",
        },
        {
          sourceType: "app_store",
          status:
            withDescriptions === 0 ? "missing" : withDescriptions < input.apps.length ? "partial" : "ok",
        },
      ],
    },
  };

  return buildIntelligenceResponse<FeatureGapsData, "feature_gaps">({
    responseType: "feature_gaps",
    data,
    evidence: featureEvidence(input.features),
    confidence: overallConfidence(input),
    caveats,
    missingSources,
    metadata: {
      contractVersion: INTELLIGENCE_CONTRACT_VERSION,
      generatedAt: input.generatedAt,
      sourceQuery: {
        query: data.query,
        country: data.country,
        appCount: data.appIds.length,
        reviewsAnalyzed: data.reviewsAnalyzed,
        featureCount: data.features.length,
        gapCount: data.gaps.length,
        enrichment: data.enrichment,
      },
      snapshotId: null,
      chartCountry: data.country,
      growthPeriod: null,
      modelVersion: input.modelVersion ?? null,
    },
  });
}

/** Convenience: deterministic matrix + envelope in one call (the no-LLM path). */
export function findFeatureGaps(
  input: FeatureGapsComputeInput,
  reviewsAnalyzed: number,
  generatedAt: string,
): FeatureGapsIntelligenceResponse {
  const { features, coverage } = findFeatureGapsDeterministic(input);
  return buildFeatureGapsResponse({
    features,
    coverage,
    reviewsAnalyzed,
    apps: input.apps,
    params: input.params,
    enrichment: "deterministic",
    generatedAt,
    modelVersion: null,
  });
}

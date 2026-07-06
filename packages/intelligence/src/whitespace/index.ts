/**
 * rank_whitespace_ideas synthesis (#261). Pure, I/O-free scoring for the final
 * rung of the decision ladder: given one candidate niche's DEEP evidence — its
 * competitor set (from find_similar_apps), review themes (#259) and feature gaps
 * (#260) — compute the five 0–100 components, the 0–100 composite, tiers, an
 * honest confidence, evidence, and a deterministic build angle. Plus the cheap
 * PRE-FILTER score used to pick which candidates earn deep analysis, and the
 * envelope builder.
 *
 * Weights (sum 1.0): demandVelocity .30, incumbentWeakness .20, sentimentGap .20,
 * featureGap .20, monetization .10. `buildDifficulty` is reported, NEVER scored.
 * Weak evidence lowers `confidence`, never inflates a component. The API service
 * owns the candidate funnel + the optional LLM phrasing seam (labels/build-angle
 * wording only — numbers are never model-touched).
 */
import {
  INTELLIGENCE_CONTRACT_VERSION,
  type FeatureGap,
  type IncumbentStrength,
  type IntelligenceCaveat,
  type IntelligenceConfidence,
  type IntelligenceEvidence,
  type RankWhitespaceIdeasRequest,
  type ReviewTheme,
  type SimilarApp,
  type WhitespaceDemand,
  type WhitespaceEvidence,
  type WhitespaceFunnel,
  type WhitespaceIdea,
  type WhitespaceIdeasData,
  type WhitespaceIdeasIntelligenceResponse,
  type WhitespaceScoreBreakdown,
  type WhitespaceTier,
  type WhitespaceEnrichment,
} from "@kittie/types";
import { buildIntelligenceResponse, type MissingIntelligenceSource } from "../intelligence-response.js";
import { calibrateConfidence } from "../confidence/index.js";

export const WHITESPACE_DEFAULTS = {
  limit: 5,
  maxLimit: 10,
  /** Max candidates carried into the pre-filter (funnel stays bounded). */
  maxCandidates: 24,
  /** Competitors per candidate for both pre-filter and deep passes. */
  competitorsPerNiche: 8,
  maxEvidencePerIdea: 5,
  weights: { demandVelocity: 0.3, incumbentWeakness: 0.2, sentimentGap: 0.2, featureGap: 0.2, monetization: 0.1 },
  /** Evidence gates (#274) — expressed in the calibration vocabulary. */
  gates: {
    /** Minimum competitors for any scored rung. */
    scoredMinCompetitors: 2,
    /** ranked additionally needs this many competitors… */
    rankedMinCompetitors: 3,
    /** …and this many grounded signal families (reviews/features/monetization/growth). */
    rankedMinSignals: 2,
    rankedMinConfidence: 0.45,
    lowConfidenceMinSignals: 1,
    /** Minimum content-token overlap for a non-seed candidate to enter the funnel. */
    coherenceMinOverlap: 1,
  },
} as const;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round = (n: number, dp = 3): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const to100 = (frac: number): number => Math.round(clamp01(frac) * 100);

/* ---- pre-filter (cheap, deterministic — picks who earns deep analysis) ---- */

/**
 * Cheap opportunity prior from catalog signals alone: momentum up-weights,
 * incumbent strength and saturation down-weight. 0..1. NO review fetch, NO LLM.
 */
export function prefilterScore(competitors: SimilarApp[]): number {
  if (competitors.length === 0) return 0;
  const apps = competitors.map((c) => c.app);
  const growths = apps.map((a) => a.growthScore).filter((g): g is number => g != null);
  const avgGrowth = growths.length ? growths.reduce((s, g) => s + g, 0) / growths.length : 0;
  const totalReviews = apps.reduce((s, a) => s + a.reviewCount, 0);
  const demand = clamp01(0.5 * (avgGrowth / 100) + 0.5 * clamp01(Math.log10(totalReviews + 1) / 6));
  const rated = apps.filter((a) => a.rating != null);
  const avgRating = rated.length ? rated.reduce((s, a) => s + (a.rating ?? 0), 0) / rated.length : 0;
  const depth = clamp01(Math.log10(totalReviews / Math.max(apps.length, 1) + 1) / 5);
  const incumbentStrength = clamp01(0.5 * (avgRating / 5) + 0.5 * depth);
  const directCount = competitors.filter((c) => c.similarityClass === "direct").length;
  const saturation = clamp01(directCount / 20);
  return round(clamp01(0.5 * demand + 0.3 * (1 - incumbentStrength) + 0.2 * (1 - saturation)));
}

/* ---- deep scoring -------------------------------------------------------- */

export interface WhitespaceDeepInput {
  niche: string;
  competitors: SimilarApp[];
  /** Themes from cluster_reviews for this niche's competitor set (empty = no signal). */
  themes: ReviewTheme[];
  /** Features from find_feature_gaps for the same set (empty = no signal). */
  features: FeatureGap[];
  reviewsAnalyzed: number;
}

const TIER = (frac: number, hasSignal: boolean): WhitespaceTier =>
  !hasSignal ? "unknown" : frac >= 0.66 ? "high" : frac >= 0.33 ? "medium" : "low";

function demandDirection(competitors: SimilarApp[]): { tier: WhitespaceDemand; frac: number } {
  const growths = competitors.map((c) => c.app.growthScore).filter((g): g is number => g != null);
  if (growths.length === 0) return { tier: "unknown", frac: 0 };
  const avg = growths.reduce((s, g) => s + g, 0) / growths.length;
  const frac = clamp01(avg / 100);
  return { tier: avg >= 55 ? "rising" : avg <= 25 ? "falling" : "flat", frac };
}

function incumbentStrengthTier(competitors: SimilarApp[]): { tier: IncumbentStrength; weaknessFrac: number } {
  if (competitors.length === 0) return { tier: "unknown", weaknessFrac: 0 };
  const apps = competitors.map((c) => c.app);
  const top = [...apps].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5);
  const rated = top.filter((a) => a.rating != null);
  const avgRating = rated.length ? rated.reduce((s, a) => s + (a.rating ?? 0), 0) / rated.length : 0;
  const avgReviews = top.length ? top.reduce((s, a) => s + a.reviewCount, 0) / top.length : 0;
  const strength = clamp01(0.5 * (avgRating / 5) + 0.5 * clamp01(Math.log10(avgReviews + 1) / 5));
  const tier: IncumbentStrength = strength >= 0.66 ? "strong" : strength >= 0.4 ? "medium" : "weak";
  return { tier, weaknessFrac: 1 - strength };
}

/** Negative-theme pressure: how loudly users hurt across the set. */
function sentimentGapFrac(themes: ReviewTheme[]): { frac: number; hasSignal: boolean } {
  if (themes.length === 0) return { frac: 0, hasSignal: false };
  const negative = themes.filter((t) => t.sentiment < 0 || t.type === "complaint" || t.type === "bug");
  const negFreq = negative.reduce((s, t) => s + t.freq, 0);
  return { frac: clamp01(negFreq / 0.5), hasSignal: true }; // 50% of reviews negative-themed → max
}

/** Gap pressure: confirmed whitespace gaps + high-demand uncovered features. */
function featureGapFrac(features: FeatureGap[]): { frac: number; hasSignal: boolean } {
  if (features.length === 0) return { frac: 0, hasSignal: false };
  const gaps = features.filter((f) => f.gap);
  const demandWeighted = features.filter((f) => f.demand === "high" && f.coverage < 0.5).length;
  return { frac: clamp01(gaps.length / 3 + demandWeighted / 6), hasSignal: true };
}

function monetizationFrac(competitors: SimilarApp[]): { frac: number; hasSignal: boolean } {
  const revenues = competitors
    .map((c) => c.app.revenueEstimate30d)
    .filter((r): r is number => r != null && r > 0);
  if (revenues.length === 0) return { frac: 0, hasSignal: false };
  const median = [...revenues].sort((a, b) => a - b)[Math.floor(revenues.length / 2)] ?? 0;
  return { frac: clamp01(Math.log10(median + 1) / 6), hasSignal: true }; // ~$1M/mo → max
}

/** Proxy: how much table-stakes surface must be shipped just to compete. */
function buildDifficultyTier(features: FeatureGap[]): WhitespaceTier {
  if (features.length === 0) return "unknown";
  const stakes = features.filter((f) => f.tableStakes).length;
  return stakes >= 6 ? "high" : stakes >= 3 ? "medium" : "low";
}

/** Grounded signal families present for a niche — the gate's evidence unit (#274). */
export function groundedSignals(input: WhitespaceDeepInput): { count: number; present: string[] } {
  const present: string[] = [];
  if (input.reviewsAnalyzed > 0 && input.themes.length > 0) present.push("reviews");
  if (input.features.length > 0) present.push("features");
  if (input.competitors.some((c) => c.app.revenueEstimate30d != null && c.app.revenueEstimate30d > 0)) present.push("monetization");
  if (input.competitors.some((c) => c.app.growthScore != null)) present.push("growth");
  return { count: present.length, present };
}

/** Score one deep-analysed niche. Pure and total; numbers never LLM-touched. */
export function scoreWhitespaceIdea(input: WhitespaceDeepInput): WhitespaceIdea {
  const { niche, competitors, themes, features } = input;
  const W = WHITESPACE_DEFAULTS.weights;

  const demand = demandDirection(competitors);
  const incumbents = incumbentStrengthTier(competitors);
  const sentiment = sentimentGapFrac(themes);
  const gaps = featureGapFrac(features);
  const monetization = monetizationFrac(competitors);

  const scoreBreakdown: WhitespaceScoreBreakdown = {
    demandVelocity: to100(demand.frac),
    incumbentWeakness: to100(incumbents.weaknessFrac),
    sentimentGap: to100(sentiment.frac),
    featureGap: to100(gaps.frac),
    monetization: to100(monetization.frac),
  };
  const score = Math.round(
    scoreBreakdown.demandVelocity * W.demandVelocity +
      scoreBreakdown.incumbentWeakness * W.incumbentWeakness +
      scoreBreakdown.sentimentGap * W.sentimentGap +
      scoreBreakdown.featureGap * W.featureGap +
      scoreBreakdown.monetization * W.monetization,
  );

  // Confidence follows evidence volume — missing signals lower it, never a component.
  const signalCount = [competitors.length > 0, sentiment.hasSignal, gaps.hasSignal, monetization.hasSignal].filter(Boolean).length;
  const confidence = round(
    clamp01(0.15 + (signalCount / 4) * 0.5 + Math.min(input.reviewsAnalyzed / 100, 1) * 0.25 + Math.min(competitors.length / 8, 1) * 0.1),
  );

  // evidence — one line per grounded signal
  const evidence: WhitespaceEvidence[] = [];
  const topComp = [...competitors].sort((a, b) => b.app.reviewCount - a.app.reviewCount)[0];
  if (topComp) {
    evidence.push({
      source: "metadata",
      text: `${competitors.length} competitors; lead: ${topComp.app.title} (${topComp.app.rating ?? "?"}★, ${topComp.app.reviewCount.toLocaleString()} reviews)`,
    });
  }
  if (demand.tier !== "unknown") {
    evidence.push({ source: "charts", text: `Demand ${demand.tier} — avg competitor growth ${scoreBreakdown.demandVelocity}/100.` });
  }
  const topPain = themes.filter((t) => t.sentiment < 0).sort((a, b) => b.mentionCount - a.mentionCount)[0];
  if (topPain) {
    evidence.push({ source: "reviews", text: `Top pain: "${topPain.theme}" — ${topPain.mentionCount} mentions, sentiment ${topPain.sentiment.toFixed(2)}.` });
  }
  const topGap = features.find((f) => f.gap) ?? features.find((f) => f.demand === "high" && f.coverage < 0.5);
  if (topGap) {
    evidence.push({ source: "features", text: `Whitespace: "${topGap.feature}" — coverage ${Math.round(topGap.coverage * 100)}%, demand ${topGap.demand}.` });
  }

  // deterministic build angle — templated from the strongest gap + pain
  const suggestedBuildAngle = topGap
    ? `Build the ${niche} app that ships "${topGap.feature}" first-class${topPain ? ` and fixes "${topPain.theme}"` : ""} — only ${Math.round(topGap.coverage * 100)}% of the field offers it.`
    : topPain
      ? `Differentiate in ${niche} by fixing "${topPain.theme}" (${topPain.mentionCount} mentions) — incumbents leave it unresolved.`
      : `Enter ${niche} on execution quality — no single dominant gap surfaced; validate positioning before building.`;

  const avoidBecause: string[] = [];
  if (incumbents.tier === "strong") avoidBecause.push("Strong incumbents (high ratings over deep review bases) — expect a hard head-on fight.");
  if (demand.tier === "falling") avoidBecause.push("Demand momentum is falling across the competitor set.");
  if (input.reviewsAnalyzed === 0) avoidBecause.push("No local reviews for this niche — pain/gap signals are ungrounded.");

  // ── evidence gate (#274): weakness gates STRUCTURE, not just the float ──
  const G = WHITESPACE_DEFAULTS.gates;
  const signals = groundedSignals(input);
  let gateRung: WhitespaceIdea["gateRung"];
  let gateReason: string;
  if (
    competitors.length >= G.rankedMinCompetitors &&
    signals.count >= G.rankedMinSignals &&
    confidence >= G.rankedMinConfidence
  ) {
    gateRung = "ranked";
    gateReason = `ranked: ${competitors.length} competitors, ${signals.count} signal families (${signals.present.join(", ")}), confidence ${confidence}.`;
  } else if (competitors.length >= G.scoredMinCompetitors && signals.count >= G.lowConfidenceMinSignals) {
    gateRung = "low_confidence";
    gateReason = `low_confidence: ${competitors.length} competitors, ${signals.count} signal families (${signals.present.join(", ") || "none"}), confidence ${confidence} — scored but flagged.`;
  } else {
    gateRung = "needs_more_sources";
    gateReason = `needs_more_sources: ${competitors.length} competitor(s), ${signals.count} grounded signal families — a score would imply rankability the evidence cannot carry.`;
  }
  const scored = gateRung !== "needs_more_sources";

  return {
    niche,
    gateRung,
    gateReason,
    score: scored ? score : null,
    scoreBreakdown: scored ? scoreBreakdown : null,
    demand: demand.tier,
    incumbentStrength: incumbents.tier,
    sentimentGap: TIER(sentiment.frac, sentiment.hasSignal),
    featureGap: TIER(gaps.frac, gaps.hasSignal),
    monetizationPotential: TIER(monetization.frac, monetization.hasSignal),
    buildDifficulty: buildDifficultyTier(features),
    confidence,
    competitorAppIds: competitors.map((c) => c.app.id),
    evidence: evidence.slice(0, WHITESPACE_DEFAULTS.maxEvidencePerIdea),
    suggestedBuildAngle,
    ...(avoidBecause.length > 0 ? { avoidBecause } : {}),
  };
}

/* ---- envelope builder ---------------------------------------------------- */

export interface BuildWhitespaceInput {
  ideas: WhitespaceIdea[];
  funnel: WhitespaceFunnel;
  /** Aggregated across the deep-analysed niches (#271); zeros/null/[] when none. */
  sourceCoverage?: {
    appsResolved: number;
    appsWithReviews: number;
    reviewsAnalyzed: number;
    reviewDateRange: { oldest: string; newest: string } | null;
    localesSeen: string[];
  };
  params: RankWhitespaceIdeasRequest;
  enrichment: WhitespaceEnrichment;
  generatedAt: string;
  modelVersion?: string | null;
}

function ideaEvidence(ideas: WhitespaceIdea[]): IntelligenceEvidence[] {
  return ideas.map<IntelligenceEvidence>((idea, i) => ({
    id: `idea:${idea.niche.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "idea"}:${i}`,
    claim: `#${i + 1} "${idea.niche}" — ${idea.score != null ? `score ${idea.score}/100` : `unscored (${idea.gateRung})`} (demand ${idea.demand}, incumbents ${idea.incumbentStrength}, feature gap ${idea.featureGap}), confidence ${idea.confidence}`,
    source: { type: "model", id: `idea:${i}`, url: null },
    valueKind: "derived",
    sourceStatus: "ok",
    freshness: "unknown",
    observedAt: null,
    metric: { name: "score", value: idea.score, unit: null },
  }));
}

/** Calibrated per docs/contracts/confidence-calibration.md (#273); response-level. */
function overallConfidence(
  ideas: WhitespaceIdea[],
  funnel: WhitespaceFunnel,
  sc: NonNullable<BuildWhitespaceInput["sourceCoverage"]> | undefined,
): IntelligenceConfidence {
  if (ideas.length === 0) {
    return { score: 0, label: "insufficient", reasons: ["No candidate niche survived the evidence funnel."] };
  }
  if (ideas.every((i) => i.gateRung === "needs_more_sources")) {
    return { score: 0, label: "insufficient", reasons: ["No idea cleared a scored evidence rung (#274 gate)."] };
  }
  const avgIdea = ideas.reduce((s, i) => s + i.confidence, 0) / ideas.length;
  // Diversity is auditable from the ideas' own evidence sources (reviews/features/charts/metadata).
  const sourcesPresent = new Set(ideas.flatMap((i) => i.evidence.map((e) => e.source))).size;
  // Primary evidence = the deep-analysed competitor set (spec §per-primitive);
  // review grounding enters as spread. Derive from the ideas themselves when a
  // caller omits sourceCoverage — still auditable, never invented.
  const appsResolved = sc?.appsResolved ?? new Set(ideas.flatMap((i) => i.competitorAppIds)).size;
  return calibrateConfidence({
    evidenceUnits: appsResolved,
    evidenceTarget: 8,
    appsContributing: sc?.appsWithReviews ?? 0,
    appsResolved,
    recentFraction: null,
    sourceTypesPresent: sourcesPresent,
    sourceTypesConsulted: 4,
    llmEnriched: false, // phrasing polish never lifts response confidence
    localesSeen: sc?.localesSeen ?? [],
    extraReasons: [
      `${funnel.candidates} candidates → ${funnel.prefiltered} pre-filtered → ${funnel.deepAnalyzed} deep-analysed`,
      `mean per-idea confidence ${round(avgIdea, 2)}`,
    ],
  });
}

/** Wrap ranked ideas into the canonical envelope, funnel counts included. */
export function buildWhitespaceIdeasResponse(input: BuildWhitespaceInput): WhitespaceIdeasIntelligenceResponse {
  const caveats: IntelligenceCaveat[] = [];
  const missingSources: MissingIntelligenceSource[] = [];

  const scoredIdeas = input.ideas.filter((i) => i.gateRung !== "needs_more_sources");
  if (input.ideas.length === 0) {
    missingSources.push({
      sourceType: "model",
      message: "No candidate sub-niche resolved competitors with usable evidence — broaden the category or supply seedIdeas.",
    });
  } else if (scoredIdeas.length === 0) {
    // Response-level gate (#274): nothing cleared a scored rung → the answer is
    // structurally insufficient, never an ok-list of ungrounded ideas.
    missingSources.push({
      sourceType: "model",
      message:
        "DO NOT build from this response: no idea cleared a scored evidence rung — every candidate needs more sources.",
    });
  } else {
    const ungrounded = input.ideas.filter((i) => i.evidence.every((e) => e.source !== "reviews"));
    if (ungrounded.length > 0) {
      caveats.push({
        kind: "weak_evidence",
        sourceType: "review",
        message: `${ungrounded.length} of ${input.ideas.length} ideas have no review-pain grounding — their sentiment/feature components lean on listings alone.`,
      });
    }
    if (input.enrichment === "deterministic") {
      caveats.push({
        kind: "weak_evidence",
        sourceType: "model",
        message: "Niche labels and build angles are templated; LLM phrasing unavailable (numbers are deterministic either way).",
      });
    }
  }

  const sc = input.sourceCoverage ?? {
    appsResolved: 0,
    appsWithReviews: 0,
    reviewsAnalyzed: 0,
    reviewDateRange: null,
    localesSeen: [],
  };
  const data: WhitespaceIdeasData = {
    category: input.params.category.trim(),
    country: input.params.country?.trim() || "US",
    funnel: input.funnel,
    ideas: input.ideas,
    enrichment: input.enrichment,
    sourceCoverage: {
      appsResolved: sc.appsResolved,
      appsWithReviews: sc.appsWithReviews,
      appsWithDescriptions: null, // listings enter via the composed feature-gaps pass, per idea
      reviewsAnalyzed: sc.reviewsAnalyzed,
      reviewDateRange: sc.reviewDateRange,
      recentFraction: null, // not aggregable across niches without per-app dates — honest null
      localesSeen: sc.localesSeen,
      notes: [
        { sourceType: "review", status: sc.reviewsAnalyzed === 0 ? "missing" : sc.appsWithReviews < sc.appsResolved ? "partial" : "ok" },
        { sourceType: "model", status: input.ideas.length === 0 ? "missing" : "ok" },
      ],
    },
  };

  return buildIntelligenceResponse<WhitespaceIdeasData, "whitespace_ideas">({
    responseType: "whitespace_ideas",
    data,
    evidence: ideaEvidence(input.ideas),
    confidence: overallConfidence(input.ideas, input.funnel, input.sourceCoverage),
    caveats,
    missingSources,
    metadata: {
      contractVersion: INTELLIGENCE_CONTRACT_VERSION,
      generatedAt: input.generatedAt,
      sourceQuery: {
        category: data.category,
        country: data.country,
        limit: input.params.limit ?? WHITESPACE_DEFAULTS.limit,
        candidates: input.funnel.candidates,
        prefiltered: input.funnel.prefiltered,
        deepAnalyzed: input.funnel.deepAnalyzed,
        enrichment: data.enrichment,
      },
      snapshotId: null,
      chartCountry: data.country,
      growthPeriod: null,
      modelVersion: input.modelVersion ?? null,
    },
  });
}

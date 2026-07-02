/**
 * validate-idea intelligence (#184) — the PURE, deterministic builder that turns
 * an interpreted idea + competitor set into the shared intelligence response
 * envelope (#180). No DB, no LLM: verdict/scores reuse the §5.5/§5.6 core in
 * `idea-validation/`, every risk/opportunity cites envelope evidence, and weak
 * or ambiguous input degrades to a low-confidence honest verdict — never a
 * fabricated strong recommendation.
 */
import type {
  IdeaScoreBreakdown,
  IdeaVerdict,
  IntelligenceCaveat,
  IntelligenceConfidence,
  IntelligenceEvidence,
  InterpretedIdea,
  SimilarApp,
  ValidateIdeaCompetitor,
  ValidateIdeaFinding,
  ValidateIdeaIntelligenceResponse,
} from "@kittie/types";
import { deriveVerdict, scoreIdea } from "./idea-validation/index.js";
import {
  buildIntelligenceResponse,
  type MissingIntelligenceSource,
} from "./intelligence-response.js";

const DEFAULT_MODEL_VERSION = "validate-idea-v1";

/** Below this total competitor review count the catalog signal is too thin to judge. */
const THIN_EVIDENCE_REVIEWS = 50;

/**
 * A competitor at/above this blended similarity is a genuine match (it cleared
 * more than one incidental-token signal), not cross-domain noise. Used as the
 * category-INDEPENDENT coherence escape so real multi-category ideas aren't sunk.
 */
const STRONG_SIMILARITY = 0.3;

/** How many competitors are surfaced with full per-app evidence. */
const MAX_COMPETITOR_EVIDENCE = 10;

export class ValidateIdeaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidateIdeaInputError";
  }
}

export interface BuildValidateIdeaInput {
  /** The idea as received (plain language). */
  idea: string;
  /** Deterministic interpretation of the idea (from the similarity core). */
  interpreted: InterpretedIdea;
  /** Ranked competitor set (from find_similar_apps), strongest first. */
  competitors: SimilarApp[];
  /** Recurring competitor improvement-area themes mined from reviews. */
  reviewThemes?: string[];
  /** Named inputs the retrieval layer could not provide (never fabricated). */
  missing?: string[];
  generatedAt: string;
  sourceQuery: Record<string, string | number | boolean | null>;
  snapshotId?: string | null;
  modelVersion?: string;
}

export function buildValidateIdeaResponse(
  input: BuildValidateIdeaInput,
): ValidateIdeaIntelligenceResponse {
  const idea = input.idea.trim();
  if (!idea) throw new ValidateIdeaInputError("Validate requires a non-empty idea.");

  const modelVersion = input.modelVersion ?? DEFAULT_MODEL_VERSION;
  const reviewThemes = input.reviewThemes ?? [];
  const competitors = input.competitors;
  const directCount = competitors.filter((c) => c.similarityClass === "direct").length;
  const totalReviews = competitors.reduce((sum, c) => sum + c.app.reviewCount, 0);
  const evidenceThin = competitors.length > 0 && totalReviews < THIN_EVIDENCE_REVIEWS;
  const ambiguous = input.interpreted.keywords.length === 0;
  const hasReviewThemes = reviewThemes.length > 0;
  // Coherence gate: a parseable idea whose surfaced apps never cohered into a
  // market is incidental-token noise (e.g. "blockchain-powered teleporting
  // sandwiches"), not a validatable market. Escapes must be GENUINELY independent
  // — `directCount > 0` implies a resolved category (a `direct` match requires
  // `sameCategory`), so it is NOT a separate signal. Instead the third escape is
  // category-INDEPENDENT: a cluster of strong lexical/similarity matches, which a
  // real cross-domain niche ("budgeting tool for freelance musicians") clears even
  // when its competitors split across Finance/Music/Business (#246 review).
  const categorised = competitors.filter((c) => c.app.category != null);
  const strongMatchCount = competitors.filter(
    (c) => c.similarityClass !== "analogue" || c.similarityScore >= STRONG_SIMILARITY,
  ).length;
  const coherentMarket =
    input.interpreted.categories.length > 0 || // interpreter resolved a store facet
    (categorised.length >= 2 && dominantCategoryShare(categorised) >= 0.5) || // apps cluster in one category
    strongMatchCount >= 2; // a real match cluster (category-independent)
  const incoherent = !ambiguous && competitors.length > 0 && !coherentMarket;

  const scores = scoreIdea({ competitors, directCount, reviewThemes });
  // Ambiguity/incoherence caps the VERDICT, not just confidence: a noisy idea with
  // incidental competitors must never surface a strong label an agent could act on.
  const verdict = deriveVerdict(scores, competitors.length, evidenceThin, ambiguous, incoherent);

  const evidence: IntelligenceEvidence[] = [interpretationEvidence(idea, input.interpreted)];
  const competitorRows = competitors
    .slice(0, MAX_COMPETITOR_EVIDENCE)
    .map((competitor) => competitorRow(competitor, evidence, modelVersion));

  const likelyCategory = likelyCategoryFor(input.interpreted, competitors);
  if (likelyCategory) {
    evidence.push({
      id: "ev_idea_likely_category",
      claim: `The idea most likely competes in the "${likelyCategory}" category.`,
      source: { type: "model", id: modelVersion, url: null },
      valueKind: "inferred",
      sourceStatus: "ok",
      freshness: "unknown",
      observedAt: null,
      metric: { name: "likely_category", value: likelyCategory, unit: null },
    });
  }

  const risks = risksFor(scores, competitorRows, directCount, evidenceThin);
  const opportunities = opportunitiesFor(scores, competitorRows, reviewThemes);
  const caveats = caveatsFor({
    competitorCount: competitors.length,
    evidenceThin,
    ambiguous,
    incoherent,
    hasReviewThemes,
    missing: input.missing ?? [],
  });
  const missingSources = missingSourcesFor(evidenceThin);
  const confidence = confidenceFor({
    competitors,
    totalReviews,
    evidenceThin,
    ambiguous,
    incoherent,
    hasReviewThemes,
  });

  return buildIntelligenceResponse({
    responseType: "idea_validation",
    data: {
      idea,
      interpreted: input.interpreted,
      likelyCategory,
      verdict,
      verdictReason: verdictReasonFor(verdict, scores, competitors.length),
      scores,
      risks,
      opportunities,
      competitors: competitorRows,
    },
    evidence,
    confidence,
    caveats,
    missingSources,
    metadata: {
      generatedAt: input.generatedAt,
      sourceQuery: input.sourceQuery,
      snapshotId: input.snapshotId ?? null,
      chartCountry: null,
      // No growth window is computed on this path; labelling one would mislabel provenance.
      growthPeriod: null,
      modelVersion,
    },
  });
}

function interpretationEvidence(idea: string, interpreted: InterpretedIdea): IntelligenceEvidence {
  const keywords = interpreted.keywords.length
    ? interpreted.keywords.join(", ")
    : "none parsed";
  return {
    id: "ev_idea_interpretation",
    claim: `Idea "${idea}" was interpreted as "${interpreted.summary}" (keywords: ${keywords}).`,
    source: { type: "user_input", id: "idea:free_text", url: null },
    // The contract requires observed evidence to cite a source URL; free-text
    // interpretation has none, so an `observed`-seeded interpretation is emitted
    // as `derived` (computed from an observed app) rather than tripping the
    // envelope contract guard with `url: null`.
    valueKind: interpreted.kind === "observed" ? "derived" : interpreted.kind,
    sourceStatus: "ok",
    freshness: "fresh",
    observedAt: null,
    metric: { name: "parsed_keywords", value: interpreted.keywords.length, unit: "keywords" },
  };
}

function competitorRow(
  competitor: SimilarApp,
  evidence: IntelligenceEvidence[],
  modelVersion: string,
): ValidateIdeaCompetitor {
  const { app } = competitor;
  const evidenceIds: string[] = [];
  const storeUrl =
    app.store === "apple"
      ? `https://apps.apple.com/us/app/id${app.storeAppId}`
      : `https://play.google.com/store/apps/details?id=${app.storeAppId}`;
  const source = {
    type: app.store === "apple" ? ("app_store" as const) : ("google_play" as const),
    id: `${app.store}:${app.storeAppId}`,
    url: storeUrl,
  };

  const identity: IntelligenceEvidence = {
    id: evidenceId(app.id, "competitor"),
    claim: `${app.title} (${app.developer}) is a ${competitor.similarityClass} competitor with ${app.reviewCount.toLocaleString("en-US")} public Store reviews${app.rating != null ? ` and a ${app.rating.toFixed(1)}★ rating` : ""}.`,
    source,
    valueKind: "observed",
    sourceStatus: "ok",
    freshness: app.updatedAt ? "fresh" : "unknown",
    observedAt: app.updatedAt ?? null,
    metric: { name: "review_count", value: app.reviewCount, unit: "reviews" },
  };
  evidence.push(identity);
  evidenceIds.push(identity.id);

  if (app.growthScore != null) {
    const growth: IntelligenceEvidence = {
      id: evidenceId(app.id, "growth_score"),
      claim: `${app.title}: modelled Growth score ${app.growthScore} (Estimated metric, not Store truth).`,
      source: { type: "model", id: modelVersion, url: null },
      valueKind: "modelled",
      sourceStatus: "ok",
      freshness: "unknown",
      observedAt: null,
      metric: { name: "growth_score", value: app.growthScore, unit: "score_0_100" },
    };
    evidence.push(growth);
    evidenceIds.push(growth.id);
  }

  return {
    appId: app.id,
    store: app.store,
    storeAppId: app.storeAppId,
    title: app.title,
    developer: app.developer,
    category: app.category,
    rating: app.rating,
    reviewCount: app.reviewCount,
    growthScore: app.growthScore,
    similarityScore: competitor.similarityScore,
    similarityClass: competitor.similarityClass,
    matchedVia: competitor.matchedVia,
    evidenceIds,
  };
}

/** Deterministic category call: interpretation first, else modal competitor category. */
function likelyCategoryFor(
  interpreted: InterpretedIdea,
  competitors: SimilarApp[],
): string | null {
  if (interpreted.categories.length > 0) return interpreted.categories[0] ?? null;
  const freq = new Map<string, number>();
  for (const c of competitors) {
    if (c.app.category) freq.set(c.app.category, (freq.get(c.app.category) ?? 0) + 1);
  }
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

function risksFor(
  scores: IdeaScoreBreakdown,
  competitors: ValidateIdeaCompetitor[],
  directCount: number,
  evidenceThin: boolean,
): ValidateIdeaFinding[] {
  const risks: ValidateIdeaFinding[] = [];
  const directIds = competitors
    .filter((c) => c.similarityClass === "direct")
    .flatMap((c) => c.evidenceIds)
    .slice(0, 6);
  const topIds = competitors.slice(0, 3).flatMap((c) => c.evidenceIds).slice(0, 6);

  if (scores.marketSaturation.score >= 0.75) {
    risks.push({
      message: `Market is saturated: ${directCount} head-on competitor(s) already serve this job.`,
      evidenceIds: directIds.length ? directIds : topIds,
    });
  } else if (scores.marketSaturation.score >= 0.4) {
    risks.push({
      message: `Market is crowded: ${directCount} direct competitor(s) found.`,
      evidenceIds: directIds.length ? directIds : topIds,
    });
  }
  if (scores.competitorQuality.score >= 0.6 && competitors.length > 0) {
    risks.push({
      message: `Incumbents are strong: ${scores.competitorQuality.basis}.`,
      evidenceIds: topIds,
    });
  }
  if (competitors.length > 0 && scores.demandSignal.score < 0.3) {
    risks.push({
      message: `Demand signal is weak: ${scores.demandSignal.basis}.`,
      evidenceIds: topIds,
    });
  }
  if (evidenceThin) {
    risks.push({
      message: "Catalog evidence is too thin to judge demand reliably; treat any verdict as provisional.",
      evidenceIds: topIds,
    });
  }
  return risks;
}

function opportunitiesFor(
  scores: IdeaScoreBreakdown,
  competitors: ValidateIdeaCompetitor[],
  reviewThemes: string[],
): ValidateIdeaFinding[] {
  const opportunities: ValidateIdeaFinding[] = [];
  const topIds = competitors.slice(0, 3).flatMap((c) => c.evidenceIds).slice(0, 6);

  if (reviewThemes.length > 0) {
    opportunities.push({
      message: `Recurring competitor complaints to win on: ${reviewThemes.slice(0, 4).join(", ")}.`,
      evidenceIds: topIds,
    });
  }
  const rated = competitors.filter((c) => c.rating != null);
  if (rated.length > 0) {
    const avgRating = rated.reduce((sum, c) => sum + (c.rating ?? 0), 0) / rated.length;
    if (avgRating < 4.0) {
      opportunities.push({
        message: `Incumbents underperform on rating (avg ${avgRating.toFixed(1)}★) — quality is an open wedge.`,
        evidenceIds: rated.slice(0, 3).flatMap((c) => c.evidenceIds).slice(0, 6),
      });
    }
  }
  if (
    competitors.length > 0 &&
    scores.demandSignal.score >= 0.45 &&
    scores.marketSaturation.score < 0.4
  ) {
    opportunities.push({
      message: `Real demand with low direct competition: ${scores.demandSignal.basis}.`,
      evidenceIds: topIds,
    });
  }
  return opportunities;
}

function caveatsFor(input: {
  competitorCount: number;
  evidenceThin: boolean;
  ambiguous: boolean;
  incoherent: boolean;
  hasReviewThemes: boolean;
  missing: string[];
}): IntelligenceCaveat[] {
  const { competitorCount, evidenceThin, ambiguous, incoherent, hasReviewThemes, missing } = input;
  const caveats: IntelligenceCaveat[] = [
    {
      kind: "estimated_metric",
      sourceType: "model",
      message: "Growth scores and demand signals are Estimated metrics from local public-signal models, not Store truth.",
    },
  ];
  if (ambiguous) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "user_input",
      message: "The idea is ambiguous: no usable keywords could be parsed, so competitor matching is unreliable.",
    });
  }
  if (incoherent) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "user_input",
      message:
        "The idea did not cohere into a market: the surfaced apps are scattered incidental matches with no shared category or head-on competitor, so the verdict is held to not_enough_data.",
    });
  }
  if (evidenceThin) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "review",
      message: `Competitor evidence is thin (fewer than ${THIN_EVIDENCE_REVIEWS} total reviews); the verdict is intentionally conservative.`,
    });
  }
  if (competitorCount === 0) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "snapshot",
      message: "No competitors surfaced from the catalog — demand is unproven, not validated.",
    });
  }
  // Catalog-wide review-theme mining is unavailable. Surface it as a PARTIAL source
  // (competitor data is present; only the theme layer is missing) — an honest caveat
  // that does NOT hard-floor confidence the way a `missing_source` would (#246).
  if (competitorCount > 0 && !hasReviewThemes) {
    caveats.push({
      kind: "partial_source",
      sourceType: "review",
      message:
        "No competitor review themes were available, so the differentiation dimension is unmined; confidence is held out of the high band rather than floored.",
    });
  }
  if (competitorCount > MAX_COMPETITOR_EVIDENCE) {
    caveats.push({
      kind: "partial_source",
      sourceType: "snapshot",
      message: `Scores and confidence consider all ${competitorCount} competitors; only the top ${MAX_COMPETITOR_EVIDENCE} carry per-app evidence rows in this response.`,
    });
  }
  for (const message of missing) {
    caveats.push({ kind: "partial_source", sourceType: null, message });
  }
  return caveats;
}

/**
 * Only genuinely-thin evidence is a `missing_source` (it correctly yields `status:
 * partial`, and its cap is a no-op because `confidenceFor` already holds a thin
 * idea to <=0.4). The catalog-wide review-theme gap is deliberately NOT a
 * missing_source — routing it here is exactly what pinned every idea to 0.59
 * (#246); it now rides as a non-capping `partial_source` caveat instead.
 */
function missingSourcesFor(evidenceThin: boolean): MissingIntelligenceSource[] | undefined {
  if (!evidenceThin) return undefined;
  return [
    {
      sourceType: "review",
      message: "Competitor review volume is too low to ground a demand judgement.",
    },
  ];
}

/**
 * Fraction of the given (already category-filtered) apps sharing their single most
 * common category (0..1). The caller passes only categorised competitors so that
 * null-category apps — common for freshly-ingested rows — do NOT dilute the share
 * and falsely mark a coherent single-market idea incoherent (#246 review).
 */
function dominantCategoryShare(categorised: SimilarApp[]): number {
  if (categorised.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const c of categorised) {
    if (c.app.category) freq.set(c.app.category, (freq.get(c.app.category) ?? 0) + 1);
  }
  if (freq.size === 0) return 0;
  return Math.max(...freq.values()) / categorised.length;
}

function confidenceFor(input: {
  competitors: SimilarApp[];
  totalReviews: number;
  evidenceThin: boolean;
  ambiguous: boolean;
  incoherent: boolean;
  hasReviewThemes: boolean;
}): IntelligenceConfidence {
  const { competitors, totalReviews, evidenceThin, ambiguous, incoherent, hasReviewThemes } = input;
  if (competitors.length === 0) {
    return {
      score: 0,
      label: "insufficient",
      reasons: ["no competitors surfaced from the catalog for this idea"],
    };
  }
  const depth = Math.min(1, Math.log10(totalReviews + 1) / 5);
  let score = 0.3 + Math.min(competitors.length, 10) * 0.03 + depth * 0.3;
  // Scope the review-theme gap to the DIFFERENTIATION dimension it actually blinds:
  // hold confidence out of the "high" band (never >=0.75) but let competitor/demand
  // depth keep moving the score — replacing the blunt floor that pinned every idea
  // to 0.59 (#246). A strong idea now lands ~0.7 (medium), a thin/nonsense one ~0.3.
  if (!hasReviewThemes) score = Math.min(score, 0.74);
  if (evidenceThin) score = Math.min(score, 0.4);
  if (ambiguous || incoherent) score = Math.min(score, 0.3);
  const rounded = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return {
    score: rounded,
    label: labelForScore(rounded),
    reasons: [
      `${competitors.length} competitor(s) grounded the verdict`,
      `${totalReviews.toLocaleString("en-US")} total competitor reviews back the demand signal`,
      ...(!hasReviewThemes
        ? ["no competitor review themes were mined, so confidence is held out of the high band"]
        : []),
      ...(evidenceThin ? ["evidence is thin, so confidence is capped"] : []),
      ...(ambiguous ? ["the idea parsed to no usable keywords, so matching is unreliable"] : []),
      ...(incoherent ? ["the surfaced apps did not cohere into a market, so the result is low-information"] : []),
    ],
  };
}

function verdictReasonFor(
  verdict: IdeaVerdict,
  scores: IdeaScoreBreakdown,
  competitorCount: number,
): string {
  if (verdict === "unvalidated") {
    return "No competitors were found in the catalog, so demand is unproven either way.";
  }
  if (verdict === "not_enough_data") {
    return "Competitors exist but carry too little review signal to judge the market honestly.";
  }
  return (
    `Saturation: ${scores.marketSaturation.basis}. ` +
    `Incumbents: ${scores.competitorQuality.basis}. ` +
    `Demand: ${scores.demandSignal.basis}. ` +
    `Differentiation: ${scores.differentiation.basis}. ` +
    `(${competitorCount} competitor(s) considered.)`
  );
}

function labelForScore(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

function evidenceId(appId: string, metric: string): string {
  const safe = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "app";
  return `ev_${safe(appId)}_${safe(metric)}`;
}

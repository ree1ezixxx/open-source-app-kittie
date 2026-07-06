/**
 * rank_whitespace_ideas contracts (#261) — the shared I/O shapes for the
 * agent-facing opportunity-ranking primitive. GENERATES candidate sub-niches for
 * a category (deterministic funnel: seed ideas + store-autocomplete keywords),
 * pre-filters them on cheap catalog signals, deep-analyses only the top-K through
 * the #259 `cluster_reviews` and #260 `find_feature_gaps` services, and returns
 * ranked opportunities with a full score breakdown, evidence, and a build angle.
 * Final rung of the decision ladder: complaints → gaps → **ranked bets**.
 *
 * Distinct from `validate_app_idea` (judges ONE supplied idea): this produces
 * the ideas. The response wraps in the canonical #180 envelope under
 * responseType `"whitespace_ideas"`; the funnel counts are reported so silent
 * truncation cannot masquerade as full coverage.
 */
import type { IntelligenceResponseEnvelope, SourceCoverage } from "./intelligence-response.js";
import type { Store } from "./index.js";

/** Coarse tiers so agents can branch without parsing raw scores. */
export type WhitespaceDemand = "unknown" | "flat" | "rising" | "falling";
export type WhitespaceTier = "unknown" | "low" | "medium" | "high";
export type IncumbentStrength = "unknown" | "weak" | "medium" | "strong";

/** Where a piece of idea evidence came from. */
export type WhitespaceEvidenceSource = "reviews" | "features" | "charts" | "keywords" | "metadata";

export interface WhitespaceEvidence {
  source: WhitespaceEvidenceSource;
  text: string;
}

/**
 * Per-component 0–100 subscores behind `score`. Weights (sum 1.0):
 * demandVelocity 0.30, incumbentWeakness 0.20, sentimentGap 0.20,
 * featureGap 0.20, monetization 0.10. `buildDifficulty` is reported as a field
 * but NOT folded into the score — the caller's build difficulty is not ours to
 * weight.
 */
export interface WhitespaceScoreBreakdown {
  demandVelocity: number;
  incumbentWeakness: number;
  sentimentGap: number;
  featureGap: number;
  monetization: number;
}

/**
 * Evidence gate rung (#274). Weakness gates STRUCTURE, not just a float —
 * agents branch on this, never on score magnitude alone:
 * - `ranked`            — full evidence; score + breakdown present.
 * - `low_confidence`    — kept and scored, but explicitly flagged.
 * - `needs_more_sources`— returned WITHOUT a score (score implies rankability).
 * A fourth outcome — refused — never appears as an idea; it is counted in
 * `funnel.refused` (candidate incoherent with the category, or zero evidence).
 */
export type WhitespaceGateRung = "ranked" | "low_confidence" | "needs_more_sources";

/** One opportunity niche. Scored only at the `ranked`/`low_confidence` rungs. */
export interface WhitespaceIdea {
  /** Plain-language niche (LLM-labelled when enriched; the candidate phrase otherwise). */
  niche: string;
  /** Which evidence rung this idea cleared (#274). */
  gateRung: WhitespaceGateRung;
  /** Why this rung — cites the evidence thresholds that fired/failed. */
  gateReason: string;
  /** 0–100 composite from `scoreBreakdown`; NULL below the scored rungs. */
  score: number | null;
  scoreBreakdown: WhitespaceScoreBreakdown | null;
  demand: WhitespaceDemand;
  incumbentStrength: IncumbentStrength;
  sentimentGap: WhitespaceTier;
  featureGap: WhitespaceTier;
  monetizationPotential: WhitespaceTier;
  /** Reported, never scored — proxied by how many table-stakes features the field expects. */
  buildDifficulty: WhitespaceTier;
  /** 0..1 — evidence volume; weak evidence lowers this, never inflates a component. */
  confidence: number;
  /** Competitor ids the deep analysis ran over (auditable). */
  competitorAppIds: string[];
  evidence: WhitespaceEvidence[];
  suggestedBuildAngle: string;
  avoidBecause?: string[];
}

/** The candidate funnel, reported honestly (no silent truncation). */
export interface WhitespaceFunnel {
  /** Distinct candidate niches generated (seeds + keywords). */
  candidates: number;
  /** Candidates that resolved ≥1 competitor and were pre-filter scored. */
  prefiltered: number;
  /** Candidates deep-analysed through cluster_reviews + find_feature_gaps. */
  deepAnalyzed: number;
  /** Candidates/ideas refused outright (#274): incoherent with the category or zero evidence. */
  refused: number;
}

export type WhitespaceEnrichment = "llm" | "deterministic";

/** `data` payload of a `whitespace_ideas` response. */
export interface WhitespaceIdeasData {
  category: string;
  country: string;
  funnel: WhitespaceFunnel;
  /** Ranked opportunities, best first. */
  ideas: WhitespaceIdea[];
  enrichment: WhitespaceEnrichment;
  /** What this answer is standing on (#271). */
  sourceCoverage: SourceCoverage;
}

/** Request body for `rank_whitespace_ideas`. */
export interface RankWhitespaceIdeasRequest {
  /** Category / broad space to generate sub-niches for (e.g. "health-behaviour"). */
  category: string;
  /** ISO market (default "US"). */
  country?: string;
  /** Ranked ideas to return = the deep-analysis budget (default 5, max 10). */
  limit?: number;
  /** Caller-supplied candidate niches, merged into the funnel. */
  seedIdeas?: string[];
  /** Drop ideas below this confidence (0..1). */
  minConfidence?: number;
  /** Restrict competitor discovery to one store. */
  store?: Store;
}

export type WhitespaceIdeasIntelligenceResponse = IntelligenceResponseEnvelope<
  WhitespaceIdeasData,
  "whitespace_ideas"
>;

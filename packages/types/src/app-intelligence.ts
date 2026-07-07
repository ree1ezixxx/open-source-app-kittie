/**
 * App-Intelligence P0 contracts — the shared I/O shapes for the agent-facing
 * `find_similar_apps` tool plus the idea-interpretation and deterministic
 * scoring vocabulary shared with the canonical validate-idea path
 * (`validate-idea-intelligence.ts`, #184). The legacy DecisionPacket-anchored
 * `validate_app_idea` result contract was retired when the #180-envelope
 * validate-idea response became canonical (coordinator ruling on #184).
 */
import type { Confidence } from "./decision-packet.js";
import type { ValueKind } from "./provenance.js";
import type { AppListItem, Store } from "./index.js";

/* ─────────────────────────── shared ─────────────────────────── */

/**
 * How a free-text idea (or a seed app) was read into structured search terms.
 * `kind` is `"observed"` when seeded from a real catalog app, `"inferred"` when
 * parsed from free text — never fabricated beyond what the input supports.
 */
export interface InterpretedIdea {
  /** Normalised one-line restatement of the idea. */
  summary: string;
  /** Inferred store category/genre labels used to find category peers. */
  categories: string[];
  /** Inferred ASO keywords / search terms used for FTS + keyword-cluster passes. */
  keywords: string[];
  /** Provenance of the interpretation. */
  kind: Extract<ValueKind, "observed" | "inferred">;
}

/* ──────────────────────── find_similar_apps ──────────────────────── */

/**
 * Relationship of a matched app to the idea.
 * - `direct`    — same job, same audience (a head-on competitor).
 * - `adjacent`  — neighbouring category or overlapping audience.
 * - `analogue`  — different domain, transferable mechanic/model.
 */
export type SimilarityClass = "direct" | "adjacent" | "analogue";

/** Which deterministic retrieval pass surfaced a candidate (match provenance). */
export type SimilarityMatchSignal =
  | "fts_keyword"
  | "category_peer"
  | "keyword_cluster"
  | "review_topic";

/** One ranked competitor returned by `find_similar_apps`. */
export interface SimilarApp {
  /** Identity + market signals (rating, reviews, growth, modelled est. revenue/downloads). */
  app: AppListItem;
  /** 0..1 deterministic blended similarity (NOT an LLM score). */
  similarityScore: number;
  similarityClass: SimilarityClass;
  /** Plain-language reasons (keyword overlap, category peer, shared review themes, …). */
  similarityReasons: string[];
  /** Retrieval passes that surfaced this app — so a consumer can audit the match. */
  matchedVia: SimilarityMatchSignal[];
}

/** Input to `find_similar_apps`. Exactly one of `query` / `appId` is required. */
export interface FindSimilarAppsInput {
  /** Free-text idea or description to find competitors for. */
  query?: string;
  /** Seed from an existing catalog app instead of free text. */
  appId?: string;
  /** Restrict to one store; default = both. */
  store?: Store;
  /** Max results (default 20). */
  limit?: number;
}

/** Result of `find_similar_apps`. */
export interface FindSimilarAppsResult {
  /** How the query was read (echoed so a caller can see the inference). */
  interpretedQuery: InterpretedIdea;
  /**
   * Categories resolved from the QUERY ITSELF, before the retrieval layer injected
   * the modal category of the strongest FTS hits into `interpretedQuery` (when the
   * query resolved none). Injected categories are incidental-hit provenance, not
   * idea provenance — consumers judging idea coherence (validate_app_idea) must
   * read these, never the possibly-injected `interpretedQuery.categories` (#246).
   */
  statedCategories?: string[];
  /** Ranked, deduped competitors — `direct` first, then `adjacent`, then `analogue`. */
  similar: SimilarApp[];
  /** Confidence in the result set, scaled to evidence (hit count, coverage). */
  confidence: Confidence;
  /** Named inputs that were unavailable (e.g. `"Meta advertising data"`); never fabricated. */
  missing: string[];
  /** One-paragraph readout an external agent can act on without parsing `similar`. */
  agentSummary: string;
}

/* ──────────────────────── validate_app_idea ──────────────────────── */

/** One deterministic sub-score: a value plus the real signal that produced it. */
export interface IdeaScore {
  /** 0..1, computed from observed/modelled signals — never an LLM guess. */
  score: number;
  /** Plain-language basis: what real signal drove this score. */
  basis: string;
}

/** The §5.5 deterministic score breakdown behind a verdict. */
export interface IdeaScoreBreakdown {
  /** How crowded the niche is (competitor count vs threshold); higher = more saturated. */
  marketSaturation: IdeaScore;
  /** Strength of incumbents (avg rating × review depth of the top competitors). */
  competitorQuality: IdeaScore;
  /** Evidence of real demand (keyword difficulty/volume, category velocity). */
  demandSignal: IdeaScore;
  /** Room to differentiate (unmet needs mined from competitor review improvement-areas). */
  differentiation: IdeaScore;
}

/**
 * Controlled verdict vocabulary (§5.6) — NOT free text, so agents can branch on
 * it. `not_enough_data` is the honest sink when evidence is thin or the idea is
 * too ambiguous to match competitors reliably.
 */
export type IdeaVerdict =
  | "strong_opportunity"
  | "has_room"
  | "crowded"
  | "saturated"
  | "unvalidated"
  | "not_enough_data";


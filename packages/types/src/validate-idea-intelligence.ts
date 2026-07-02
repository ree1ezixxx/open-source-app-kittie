/**
 * Validate-idea intelligence contracts (#184) — plain-language idea in,
 * evidence-first validation out, on the shared intelligence response envelope
 * (#180). Sibling of `app-detail-intelligence.ts`, the trends response, and
 * `compare-apps-intelligence.ts`.
 *
 * Deliberately reuses the controlled §5.6 `IdeaVerdict` vocabulary and the
 * deterministic `IdeaScoreBreakdown` from `app-intelligence.ts` so both
 * idea-validation surfaces speak the same domain language. No LLM synthesis
 * on this path: every field is computed from observed/modelled catalog
 * signals, and weak evidence produces a low-confidence honest verdict.
 */
import type {
  IdeaScoreBreakdown,
  IdeaVerdict,
  InterpretedIdea,
  SimilarityClass,
  SimilarityMatchSignal,
} from "./app-intelligence.js";
import type { IntelligenceResponseEnvelope } from "./intelligence-response.js";
import type { Store } from "./index.js";

/** Input to `POST /api/v1/app-intelligence/validate-idea`. */
export interface ValidateIdeaIntelligenceRequest {
  /** The app idea to validate, in plain language. */
  idea: string;
  /** Restrict competitor search to one store; default = both. */
  store?: Store;
  /** Max competitors considered (default 20, capped at 50). */
  limit?: number;
}

/** One competitor the verdict was reasoned from, with its evidence links. */
export interface ValidateIdeaCompetitor {
  appId: string;
  store: Store;
  storeAppId: string;
  title: string;
  developer: string;
  category: string | null;
  rating: number | null;
  reviewCount: number;
  /** Modelled Growth score (Estimated metric), never Store truth. */
  growthScore: number | null;
  /** 0..1 deterministic blended similarity (NOT an LLM score). */
  similarityScore: number;
  similarityClass: SimilarityClass;
  /** Retrieval passes that surfaced this app — so a consumer can audit the match. */
  matchedVia: SimilarityMatchSignal[];
  /** Envelope `evidence[]` ids backing this competitor's cited signals. */
  evidenceIds: string[];
}

/** One risk or opportunity note, grounded in envelope evidence. */
export interface ValidateIdeaFinding {
  message: string;
  evidenceIds: string[];
}

export interface ValidateIdeaIntelligenceData {
  /** The idea as received (trimmed). */
  idea: string;
  /** How the idea was read into categories/keywords (observed or inferred). */
  interpreted: InterpretedIdea;
  /** Most likely store category, inferred from the interpretation or the competitor set. */
  likelyCategory: string | null;
  /** Controlled §5.6 verdict label — agents can branch on it. */
  verdict: IdeaVerdict;
  /** Plain-language basis for the verdict (deterministic, from real signals). */
  verdictReason: string;
  /** Deterministic §5.5 score breakdown behind the verdict. */
  scores: IdeaScoreBreakdown;
  risks: ValidateIdeaFinding[];
  opportunities: ValidateIdeaFinding[];
  /** Ranked competitor evidence set (strongest similarity first). */
  competitors: ValidateIdeaCompetitor[];
}

export type ValidateIdeaIntelligenceResponse = IntelligenceResponseEnvelope<
  ValidateIdeaIntelligenceData,
  "idea_validation"
>;

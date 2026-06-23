/**
 * Decision-packet builder (lane L2, epic #97). Constructs and VALIDATES the
 * canonical `DecisionPacket` every strategic Kittie tool returns. The shape
 * itself lives in `@kittie/types`; this is the builder + its invariants.
 */
import type {
  Confidence,
  DecisionCoverage,
  DecisionCoverageStatus,
  DecisionPacket,
  Evidence,
  EvidenceValueType,
  RecommendedAction,
} from "@kittie/types";

/** The present `ValueKind`s — evidence can never be `missing`. */
const PRESENT_KINDS: readonly EvidenceValueType[] = ["observed", "modelled", "derived", "inferred"];

export class DecisionPacketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionPacketError";
  }
}

export interface BuildDecisionInput {
  decision: string;
  evidence: Evidence[];
  confidence: Confidence;
  assumptions?: string[];
  unknowns?: string[];
  recommendedActions?: RecommendedAction[];
  snapshotId: string;
  /** Named inputs that were unavailable — populates `coverage.missing`. */
  missing?: string[];
}

/**
 * Build a validated `DecisionPacket`. Enforces the honesty invariants:
 * - evidence `valueType` must be a present `ValueKind` (never `missing`);
 * - an `observed` claim MUST carry a `sourceUrl` (so clients can cite it);
 * - `confidence.score` is in [0, 1];
 * - `coverage.missing` is carried through and drives `coverage.status`.
 */
export function buildDecisionPacket(input: BuildDecisionInput): DecisionPacket {
  for (const e of input.evidence) {
    if (!PRESENT_KINDS.includes(e.valueType)) {
      throw new DecisionPacketError(
        `evidence valueType "${e.valueType}" is not a present ValueKind (claim: "${e.claim}")`,
      );
    }
    if (e.valueType === "observed" && !e.sourceUrl) {
      throw new DecisionPacketError(`observed evidence requires a sourceUrl (claim: "${e.claim}")`);
    }
  }

  const { score } = input.confidence;
  if (Number.isNaN(score) || score < 0 || score > 1) {
    throw new DecisionPacketError(`confidence.score must be in [0, 1], got ${score}`);
  }

  const missing = input.missing ?? [];
  const coverage: DecisionCoverage = {
    status: deriveCoverageStatus(input.evidence.length, missing.length),
    missing,
  };

  return {
    decision: input.decision,
    evidence: input.evidence,
    confidence: input.confidence,
    coverage,
    assumptions: input.assumptions ?? [],
    unknowns: input.unknowns ?? [],
    recommendedActions: input.recommendedActions ?? [],
    snapshotId: input.snapshotId,
  };
}

function deriveCoverageStatus(evidenceCount: number, missingCount: number): DecisionCoverageStatus {
  if (evidenceCount === 0) return "none";
  return missingCount === 0 ? "full" : "partial";
}

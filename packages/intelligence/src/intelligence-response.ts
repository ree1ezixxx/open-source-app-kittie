import {
  INTELLIGENCE_CONTRACT_VERSION,
  type IntelligenceCaveat,
  type IntelligenceConfidence,
  type IntelligenceEvidence,
  type IntelligenceResponseEnvelope,
  type IntelligenceResponseMetadata,
  type IntelligenceResponseType,
  type IntelligenceSourceType,
  type IntelligenceStatus,
} from "@kittie/types";

export class IntelligenceResponseContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntelligenceResponseContractError";
  }
}

export interface MissingIntelligenceSource {
  sourceType: IntelligenceSourceType;
  message: string;
}

export interface BuildIntelligenceResponseInput<
  TData,
  TType extends IntelligenceResponseType = IntelligenceResponseType,
> {
  responseType: TType;
  data: TData;
  evidence: IntelligenceEvidence[];
  confidence: IntelligenceConfidence;
  caveats?: IntelligenceCaveat[];
  missingSources?: MissingIntelligenceSource[];
  metadata: Omit<IntelligenceResponseMetadata, "contractVersion"> & {
    contractVersion?: typeof INTELLIGENCE_CONTRACT_VERSION;
  };
}

/**
 * Build a response envelope and enforce the cross-surface honesty rules:
 * every response has the same envelope, required fields are present, and missing
 * sources lower confidence instead of being represented as zero-value signals.
 */
export function buildIntelligenceResponse<
  TData,
  TType extends IntelligenceResponseType = IntelligenceResponseType,
>(
  input: BuildIntelligenceResponseInput<TData, TType>,
): IntelligenceResponseEnvelope<TData, TType> {
  assertConfidence(input.confidence);
  for (const e of input.evidence) assertEvidence(e);

  const missingCaveats = (input.missingSources ?? []).map<IntelligenceCaveat>((missing) => ({
    kind: "missing_source",
    sourceType: missing.sourceType,
    message: missing.message,
  }));
  const caveats = [...(input.caveats ?? []), ...missingCaveats];
  const confidence = applyMissingSourceConfidence(input.confidence, missingCaveats);
  const status = deriveStatus(input.evidence.length, missingCaveats.length, confidence.score);

  return {
    responseType: input.responseType,
    status,
    data: input.data,
    evidence: input.evidence,
    confidence,
    caveats,
    metadata: {
      ...input.metadata,
      contractVersion: input.metadata.contractVersion ?? INTELLIGENCE_CONTRACT_VERSION,
    },
  };
}

function assertEvidence(evidence: IntelligenceEvidence): void {
  if (!evidence.id) throw new IntelligenceResponseContractError("evidence.id is required");
  if (!evidence.claim) throw new IntelligenceResponseContractError(`evidence.claim is required for ${evidence.id}`);
  if (!evidence.source.id) {
    throw new IntelligenceResponseContractError(`evidence.source.id is required for ${evidence.id}`);
  }
  if (evidence.valueKind === "observed" && evidence.source.url == null) {
    throw new IntelligenceResponseContractError(`observed evidence requires source.url for ${evidence.id}`);
  }
}

function assertConfidence(confidence: IntelligenceConfidence): void {
  if (Number.isNaN(confidence.score) || confidence.score < 0 || confidence.score > 1) {
    throw new IntelligenceResponseContractError(`confidence.score must be in [0, 1], got ${confidence.score}`);
  }
  if (confidence.reasons.length === 0) {
    throw new IntelligenceResponseContractError("confidence.reasons must not be empty");
  }
}

function applyMissingSourceConfidence(
  confidence: IntelligenceConfidence,
  missingCaveats: IntelligenceCaveat[],
): IntelligenceConfidence {
  if (missingCaveats.length === 0) return confidence;

  const cappedScore = Math.min(confidence.score, missingCaveats.length > 1 ? 0.49 : 0.59);
  return {
    score: cappedScore,
    label: labelForScore(cappedScore),
    reasons: [
      ...confidence.reasons,
      ...missingCaveats.map((caveat) => caveat.message),
    ],
  };
}

function labelForScore(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

function deriveStatus(
  evidenceCount: number,
  missingSourceCount: number,
  score: number,
): IntelligenceStatus {
  if (evidenceCount === 0 || score === 0) return "insufficient";
  return missingSourceCount === 0 ? "ok" : "partial";
}

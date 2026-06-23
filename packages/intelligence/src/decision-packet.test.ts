import { describe, expect, it } from "vitest";
import type { Evidence } from "@kittie/types";
import { DecisionPacketError, buildDecisionPacket } from "./decision-packet.js";

const observedEvidence: Evidence = {
  claim: "Four competitors' reviews repeatedly cite failure during high-risk moments.",
  valueType: "observed",
  sourceId: "review-cluster-182",
  sourceUrl: "https://example.com/reviews/182",
  observedAt: "2026-06-23T00:00:00Z",
};

function baseInput() {
  return {
    decision: "Prioritise an urge-interruption mode before community features.",
    evidence: [observedEvidence],
    confidence: { score: 0.84, reasons: ["large review sample", "repeated across four competitors"] },
    snapshotId: "snapshot_123",
  };
}

describe("buildDecisionPacket", () => {
  it("builds the full canonical shape", () => {
    const p = buildDecisionPacket(baseInput());
    expect(Object.keys(p).sort()).toEqual([
      "assumptions",
      "confidence",
      "coverage",
      "decision",
      "evidence",
      "recommendedActions",
      "snapshotId",
      "unknowns",
    ]);
    expect(p.assumptions).toEqual([]);
    expect(p.recommendedActions).toEqual([]);
  });

  it("rejects an observed claim missing a sourceUrl", () => {
    const input = baseInput();
    input.evidence = [{ ...observedEvidence, sourceUrl: null }];
    expect(() => buildDecisionPacket(input)).toThrow(DecisionPacketError);
  });

  it("allows a modelled/derived/inferred claim without a sourceUrl", () => {
    const input = baseInput();
    input.evidence = [{ ...observedEvidence, valueType: "modelled", sourceUrl: null }];
    expect(() => buildDecisionPacket(input)).not.toThrow();
  });

  it("rejects a non-present valueType (e.g. missing)", () => {
    const input = baseInput();
    input.evidence = [{ ...observedEvidence, valueType: "missing" as unknown as Evidence["valueType"] }];
    expect(() => buildDecisionPacket(input)).toThrow(/not a present ValueKind/);
  });

  it("rejects a confidence score outside [0,1]", () => {
    expect(() => buildDecisionPacket({ ...baseInput(), confidence: { score: 1.5, reasons: [] } })).toThrow(
      DecisionPacketError,
    );
  });

  it("derives coverage.status from evidence + missing inputs", () => {
    expect(buildDecisionPacket(baseInput()).coverage).toEqual({ status: "full", missing: [] });
    expect(buildDecisionPacket({ ...baseInput(), missing: ["Meta advertising data"] }).coverage).toEqual({
      status: "partial",
      missing: ["Meta advertising data"],
    });
    expect(buildDecisionPacket({ ...baseInput(), evidence: [] }).coverage.status).toBe("none");
  });
});

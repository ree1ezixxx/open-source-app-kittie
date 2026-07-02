import { describe, expect, it } from "vitest";
import { adaptValidate } from "./adapt";

// A canonical /validate-idea (#180) envelope, post tryLive `{data}` unwrap.
const envelope = {
  responseType: "idea_validation",
  status: "ok",
  data: {
    idea: "a focus timer for exam-week students",
    interpreted: { summary: "Focus timer for students during exams.", categories: ["Productivity"], keywords: [], kind: "inferred" },
    likelyCategory: "Productivity",
    verdict: "has_room",
    verdictReason: "Productivity is crowded but no incumbent owns exam-week planning.",
    scores: {
      marketSaturation: { score: 0.7, basis: "42 category peers" },
      competitorQuality: { score: 0.6, basis: "strong incumbents" },
      demandSignal: { score: 0.5, basis: "steady keyword volume" },
      differentiation: { score: 0.65, basis: "unmet exam-week need" },
    },
    risks: [{ message: "Crowded category.", evidenceIds: ["e1"] }],
    opportunities: [{ message: "Exam-week planning underserved.", evidenceIds: ["e2"] }],
    competitors: [
      { appId: "apple:1", store: "apple", storeAppId: "1", title: "Focus Timer", developer: "DWL", category: "Productivity", rating: 4.8, reviewCount: 100, growthScore: 78, similarityScore: 0.82, similarityClass: "direct", matchedVia: ["fts_keyword"], evidenceIds: ["e3"] },
    ],
  },
  evidence: [
    { id: "e2", claim: "Few apps target exam-week planning.", source: { type: "keyword", id: "kw:1", url: null }, valueKind: "derived", sourceStatus: "ok", freshness: "fresh", observedAt: "2026-07-02T00:00:00.000Z", metric: null },
  ],
  confidence: { score: 0.68, label: "medium", reasons: ["competitor evidence found"] },
  caveats: [{ kind: "partial_source", sourceType: "review", message: "Review coverage is partial." }],
  metadata: { snapshotId: "snap_1" },
};

describe("adaptValidate — #180 envelope", () => {
  const out = adaptValidate(envelope, "a focus timer for exam-week students");

  it("maps idea, interpretation, and marks the result live", () => {
    expect(out.idea).toBe("a focus timer for exam-week students");
    expect(out.interpretedIdea).toBe("Focus timer for students during exams.");
    expect(out.source).toBe("live");
  });

  it("composes a DecisionPacket from the envelope's verdict/evidence/confidence/caveats", () => {
    expect(out.verdict.decision).toBe("has_room");
    expect(out.verdict.confidence.score).toBe(0.68);
    expect(out.verdict.evidence[0]?.claim).toContain("exam-week planning");
    expect(out.verdict.evidence[0]?.valueType).toBe("derived");
    expect(out.verdict.coverage.status).toBe("partial");
    expect(out.verdict.coverage.missing).toContain("Review coverage is partial.");
    expect(out.verdict.snapshotId).toBe("snap_1");
  });

  it("maps the deterministic scores and composite", () => {
    expect(out.scoreBreakdown).toHaveLength(4);
    expect(out.scoreBreakdown.find((s) => s.label === "Demand signal")?.score).toBe(50);
    expect(out.overallScore).toBe(Math.round(100 * (0.5 * 0.4 + 0.6 * 0.3 + 0.65 * 0.3)));
  });

  it("maps flat competitors and finding-shaped risks", () => {
    expect(out.competitorSummary.count).toBe(1);
    expect(out.competitorSummary.top[0]?.name).toBe("Focus Timer");
    expect(out.competitorSummary.top[0]?.similarityClass).toBe("direct");
    expect(out.risks[0]?.risk).toBe("Crowded category.");
  });

  it("leaves LLM-only fields honestly empty (deterministic path) and derives the summary", () => {
    expect(out.mvp).toEqual([]);
    expect(out.recommendedAngle).toBe("");
    expect(out.agentSummary).toContain("has room");
    expect(out.agentSummary).toContain("exam-week planning");
  });
});

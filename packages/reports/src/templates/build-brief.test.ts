import { describe, expect, it } from "vitest";
import type { ValidateIdeaIntelligenceResponse } from "@kittie/types";
import { renderReportContent } from "../render.js";
import { buildBuildBriefReport } from "./build-brief.js";
import { createReportRegistry } from "./index.js";

const FORMATS = ["json", "markdown", "html"] as const;
const registry = createReportRegistry();

// Partial fixtures cast to the contract — the builder only reads these fields;
// build-brief.ts already typechecks against the full ValidateIdea types.
const strong = {
  responseType: "idea_validation",
  status: "ok",
  data: {
    idea: "a focus timer for exam-week students",
    likelyCategory: "Productivity",
    verdict: "has_room",
    verdictReason: "Productivity is crowded but no incumbent owns exam-week planning.",
    risks: [{ message: "Crowded category with strong incumbents.", evidenceIds: ["e1"] }],
    opportunities: [{ message: "Exam-week planning is underserved.", evidenceIds: ["e2"] }],
    competitors: [
      { title: "Focus Timer", developer: "Deep Work Labs", similarityClass: "strong" },
      { title: "Deep Focus", developer: "Calm Co", similarityClass: "moderate" },
    ],
  },
  evidence: [
    { id: "e2", claim: "Few apps target exam-week planning.", source: { type: "keyword", id: "k1", url: null }, valueKind: "derived", sourceStatus: "ok", freshness: "fresh", observedAt: null, metric: null },
  ],
  confidence: { score: 0.68, label: "medium", reasons: ["competitor evidence found"] },
  caveats: [{ kind: "partial_source", sourceType: "review", message: "Review coverage is partial." }],
  metadata: { contractVersion: "2026-07-01", generatedAt: "2026-07-02T00:00:00.000Z", sourceQuery: { idea: "focus timer" }, snapshotId: "snap_1", chartCountry: "US", growthPeriod: "7d", modelVersion: "v1" },
} as unknown as ValidateIdeaIntelligenceResponse;

const weak = {
  ...strong,
  status: "insufficient",
  data: {
    ...strong.data,
    verdict: "not_enough_data",
    verdictReason: "Too few comparable apps to judge demand.",
    opportunities: [],
    risks: [],
    competitors: [],
  },
  confidence: { score: 0.2, label: "insufficient", reasons: ["thin competitor evidence"] },
} as unknown as ValidateIdeaIntelligenceResponse;

describe("build-brief template", () => {
  const contract = buildBuildBriefReport(strong);

  it("routes through the registered template", () => {
    expect(contract.template).toBe("build_brief");
    expect(registry.has("build_brief")).toBe(true);
  });

  it("includes thesis, competitors, opportunity, risks, features, non-goals, and tasks in every format", () => {
    for (const format of FORMATS) {
      const { content } = renderReportContent(contract, format, registry);
      expect(content).toContain("exam-week");
      if (format === "json") {
        const parsed = JSON.parse(content);
        const headings = parsed.document.sections.map((s: { heading: string }) => s.heading);
        expect(headings).toEqual(
          expect.arrayContaining(["Thesis", "Opportunity", "Competitors", "Risks", "Feature list", "Non-goals", "Agent-ready tasks"]),
        );
        expect(parsed.confidence.label).toBe("medium");
        expect(parsed.evidence.length).toBeGreaterThan(0);
      } else {
        for (const h of ["Thesis", "Opportunity", "Competitors", "Risks", "Feature list", "Non-goals", "Agent-ready tasks"]) {
          expect(content).toContain(h);
        }
        expect(content).toContain("Focus Timer");
        expect(content).toContain("medium (0.68)");
      }
    }
  });

  it("derives feature list and non-goals from opportunities and risks", () => {
    expect(contract.output?.features).toContain("Address: Exam-week planning is underserved.");
    expect(contract.output?.nonGoals).toContain("Avoid: Crowded category with strong incumbents.");
    expect(contract.output?.agentTasks[0]).toContain("Prototype the core flow");
  });

  it("is not cautious with medium confidence + a real verdict", () => {
    expect(contract.output?.cautious).toBe(false);
    expect(contract.output?.thesis).not.toContain("Provisional");
  });
});

describe("build-brief with weak evidence", () => {
  const contract = buildBuildBriefReport(weak);

  it("uses cautious language and adds a weak-evidence caveat", () => {
    expect(contract.output?.cautious).toBe(true);
    expect(contract.output?.thesis).toContain("Provisional");
    expect(contract.evidenceSnapshot.caveats.map((c) => c.kind)).toContain("weak_evidence");
    expect(contract.status).toBe("partial");
  });

  it("adds an evidence-gathering task and renders empty sections honestly", () => {
    expect(contract.output?.agentTasks.some((t) => t.includes("more market evidence"))).toBe(true);
    const md = renderReportContent(contract, "markdown", registry).content;
    expect(md).toContain("No standout opportunities surfaced.");
    expect(md).toContain("No competitors matched.");
  });
});

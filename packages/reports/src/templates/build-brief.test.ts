import { describe, expect, it } from "vitest";
import { renderReportContent } from "../render.js";
import { buildBuildBriefReport } from "./build-brief.js";
import { validateIdeaFixture, validateIdeaWeakFixture } from "./fixtures.js";
import { createReportRegistry } from "./index.js";

const FORMATS = ["json", "markdown", "html"] as const;
const registry = createReportRegistry();

describe("build-brief template", () => {
  const contract = buildBuildBriefReport(validateIdeaFixture);

  it("routes through the registered template", () => {
    expect(contract.template).toBe("build_brief");
    expect(registry.has("build_brief")).toBe(true);
  });

  it("includes all brief sections + evidence/confidence/caveats in every format", () => {
    for (const format of FORMATS) {
      const { content } = renderReportContent(contract, format, registry);
      expect(content).toContain("exam-week");
      if (format === "json") {
        const parsed = JSON.parse(content);
        const headings = parsed.document.sections.map((s: { heading: string }) => s.heading);
        expect(headings).toEqual(
          expect.arrayContaining([
            "Thesis",
            "Opportunity",
            "Competitors",
            "Risks",
            "Feature list (derived)",
            "Non-goals (derived)",
            "Agent-ready tasks (derived)",
          ]),
        );
        expect(parsed.confidence.label).toBe("medium");
        expect(parsed.evidence.length).toBeGreaterThan(0);
      } else {
        for (const h of ["Thesis", "Opportunity", "Competitors", "Risks", "Feature list (derived)", "Non-goals (derived)", "Agent-ready tasks (derived)"]) {
          expect(content).toContain(h);
        }
        expect(content).toContain("Focus Timer");
        expect(content).toContain("medium (0.68)");
      }
    }
  });

  it("labels the derived sections as derived (honest-data)", () => {
    const md = renderReportContent(contract, "markdown", registry).content;
    expect(md).toContain("Feature list (derived)");
    expect(md).toContain("Non-goals (derived)");
    expect(md).toContain("Agent-ready tasks (derived)");
  });

  it("carries per-item evidence ids through to the rendered brief", () => {
    const md = renderReportContent(contract, "markdown", registry).content;
    expect(md).toContain("Exam-week planning is underserved. [ev_gap]");
    expect(md).toContain("[ev_competitor]");
    // Derived features inherit the source opportunity's evidence ids.
    expect(contract.output?.features[0]?.evidenceIds).toEqual(["ev_gap"]);
  });

  it("is complete + non-cautious with medium confidence + a real verdict", () => {
    expect(contract.output?.cautious).toBe(false);
    expect(contract.output?.thesis).not.toContain("Provisional");
    expect(contract.status).toBe("complete");
  });
});

describe("build-brief with weak / zero evidence", () => {
  const contract = buildBuildBriefReport(validateIdeaWeakFixture);

  it("is cautious, partial, and adds a weak-evidence caveat even with zero source evidence", () => {
    expect(contract.output?.cautious).toBe(true);
    expect(contract.output?.thesis).toContain("Provisional");
    expect(contract.status).toBe("partial");
    expect(contract.evidenceSnapshot.evidence).toHaveLength(0);
    expect(contract.evidenceSnapshot.caveats.map((c) => c.kind)).toContain("weak_evidence");
  });

  it("does NOT fabricate a concrete feature — the feature list is a validation step", () => {
    const features = contract.output?.features ?? [];
    expect(features).toHaveLength(1);
    expect(features[0]?.message.toLowerCase()).toContain("gather demand evidence");
    expect(features[0]?.message.toLowerCase()).not.toContain("ship the core");
    const md = renderReportContent(contract, "markdown", registry).content;
    expect(md).toContain("Gather demand evidence before committing");
    expect(md).toContain("No standout opportunities surfaced.");
    expect(md).toContain("No competitors matched.");
  });

  it("adds an evidence-gathering agent task", () => {
    expect(contract.output?.agentTasks.some((t) => t.includes("more market evidence"))).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import type { AuditReport } from "@kittie/types";
import { generateBuildBrief } from "./audit-brief.js";

function report(over: Partial<AuditReport> = {}): AuditReport {
  return {
    appId: "app_1",
    appName: "Cal AI",
    category: "Health & Fitness",
    iconUrl: null,
    generatedAt: "2026-06-27T00:00:00.000Z",
    scores: [
      { name: "momentum", label: "Momentum", value: 72, sourceStatus: "available", inputs: {} },
      { name: "demand", label: "Demand", value: null, sourceStatus: "unavailable", inputs: {} },
      { name: "monetisation", label: "Monetisation", value: 64, sourceStatus: "available", inputs: {} },
    ],
    confidence: { value: 0.6, label: "Medium", reasons: ["3/4 sources available"], coverage: 0.75, sampleSize: 1200, freshness: "fresh", agreement: 0.6 },
    sources: [],
    evidence: [
      { id: "mom-review-velocity", kind: "momentum", title: "Review velocity +18% / 7d", detail: "1200 vs 1000", sourceStatus: "available" },
    ],
    painClusters: [
      { theme: "Pricing & paywalls", frequency: 12, share: 0.3, negativeShare: 1, exampleReviews: ["too expensive"], opportunity: "A fairly-priced alternative." },
    ],
    ...over,
  };
}

describe("generateBuildBrief", () => {
  it("produces every export format", () => {
    const b = generateBuildBrief(report());
    expect(b.idea.length).toBeGreaterThan(0);
    expect(b.markdown).toContain("# Build brief");
    expect(b.githubIssues).toContain("- [ ]");
    expect(b.claudeCodePrompt).toContain("Claude Code");
    expect(b.codexPrompt.length).toBeGreaterThan(0);
    expect(b.rorkPrompt.length).toBeGreaterThan(0);
    expect(b.mcpCall).toContain("kittie.generate_build_brief");
    expect(b.doNotBuild.length).toBeGreaterThan(0);
  });

  it("derives the wedge from the top pain cluster", () => {
    const b = generateBuildBrief(report());
    expect(b.markdown).toContain("A fairly-priced alternative.");
    expect(b.idea).toContain("Pricing & paywalls");
  });

  it("JSON export is valid and carries the scores + provenance", () => {
    const b = generateBuildBrief(report());
    const parsed = JSON.parse(b.json);
    expect(parsed.sourceApp).toBe("Cal AI");
    expect(parsed.scores).toHaveLength(3);
    expect(parsed.generatedAt).toBe("2026-06-27T00:00:00.000Z");
  });

  it("is deterministic", () => {
    expect(generateBuildBrief(report())).toEqual(generateBuildBrief(report()));
  });

  it("handles an audit with no pain clusters", () => {
    const b = generateBuildBrief(report({ painClusters: [] }));
    expect(b.markdown).toContain("# Build brief");
    expect(b.idea.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { buildAuditReport, type AuditInput } from "./audit.js";
import type { AppSignals } from "./types.js";

const AT = "2026-06-27T00:00:00.000Z";

function signals(over: Partial<AppSignals> = {}): AppSignals {
  return {
    category: "Health & Fitness",
    chartRank: 12,
    reviewCount: 1200,
    reviewCountPrior: 1000,
    rating: 4.6,
    iapCount: 3,
    metaAdCount: 0,
    metaAdCountPrior: null,
    chartRankPrior: 20,
    priorDays: 7,
    updatedAt: new Date("2026-06-20"),
    releasedAt: new Date("2025-01-01"),
    categoryAppCount: 120,
    ...over,
  };
}

function input(over: Partial<AppSignals> = {}): AuditInput {
  return {
    app: { id: "app_1", name: "Cal AI", category: "Health & Fitness", iconUrl: null },
    signals: signals(over),
  };
}

describe("buildAuditReport", () => {
  it("returns a Momentum sub-score and is deterministic for a fixed generatedAt", () => {
    const a = buildAuditReport(input(), AT);
    const b = buildAuditReport(input(), AT);
    expect(a).toEqual(b);
    const momentum = a.scores.find((s) => s.name === "momentum");
    expect(momentum).toBeDefined();
    expect(momentum!.value).toBeGreaterThan(0);
    expect(momentum!.sourceStatus).toBe("available");
  });

  it("emits traceable evidence for review velocity and rank movement", () => {
    const report = buildAuditReport(input(), AT);
    const kinds = report.evidence.map((e) => e.id);
    expect(kinds).toContain("mom-review-velocity");
    expect(kinds).toContain("mom-rank");
    expect(report.evidence.every((e) => e.title.length > 0)).toBe(true);
  });

  it("with no priors: confidence drops, momentum is partial, never fabricates a velocity card", () => {
    const report = buildAuditReport(
      input({ reviewCountPrior: null, chartRank: null, chartRankPrior: null }),
      AT,
    );
    const momentum = report.scores.find((s) => s.name === "momentum")!;
    expect(momentum.sourceStatus).toBe("partial");
    expect(momentum.note).toMatch(/second day/i);
    expect(report.confidence.label === "Low" || report.confidence.label === "Experimental").toBe(true);
    expect(report.evidence.find((e) => e.id === "mom-review-velocity")).toBeUndefined();
  });

  it("carries app identity + iso timestamp through", () => {
    const report = buildAuditReport(input(), AT);
    expect(report.appId).toBe("app_1");
    expect(report.appName).toBe("Cal AI");
    expect(report.generatedAt).toBe(AT);
  });
});

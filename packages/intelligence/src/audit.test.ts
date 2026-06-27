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

  it("surfaces a source strip with ads unavailable and reviews available (#171)", () => {
    const report = buildAuditReport(input(), AT);
    const byKey = Object.fromEntries(report.sources.map((s) => [s.key, s]));
    expect(byKey.reviews?.status).toBe("available");
    expect(byKey.ads?.status).toBe("unavailable");
    expect(byKey.ads?.note).toBeTruthy();
  });

  it("folds review pain into a Pain score + clusters + evidence (#172)", () => {
    const reviews = [
      ...Array.from({ length: 9 }, () => ({ text: "too expensive, paywall rip off", rating: 1 })),
      { text: "love it", rating: 5 },
    ];
    const report = buildAuditReport({ ...input(), reviews }, AT);
    const pain = report.scores.find((s) => s.name === "pain")!;
    expect(pain.sourceStatus).toBe("available");
    expect(pain.value).not.toBeNull();
    expect(report.painClusters?.[0]?.theme).toBe("Pricing & paywalls");
    expect(report.evidence.some((e) => e.kind === "pain")).toBe(true);
  });

  it("with no reviews: Pain is unavailable, value null, never fabricated (#172)", () => {
    const report = buildAuditReport(input(), AT);
    const pain = report.scores.find((s) => s.name === "pain")!;
    expect(pain.sourceStatus).toBe("unavailable");
    expect(pain.value).toBeNull();
    expect(report.painClusters).toEqual([]);
    const reviewText = report.sources.find((s) => s.key === "review-text")!;
    expect(reviewText.status).toBe("unavailable");
  });

  it("carries app identity + iso timestamp through", () => {
    const report = buildAuditReport(input(), AT);
    expect(report.appId).toBe("app_1");
    expect(report.appName).toBe("Cal AI");
    expect(report.generatedAt).toBe(AT);
  });
});

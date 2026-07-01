import { describe, expect, it } from "vitest";

import { buildAuditReport, computeConfidenceScore } from "./audit.js";
import type { AppSignals } from "./types.js";

const now = new Date("2026-07-01T12:00:00.000Z");

const signals = (over: Partial<AppSignals> = {}): AppSignals => ({
  category: "Productivity",
  chartRank: 42,
  reviewCount: 2_840,
  reviewCountPrior: 2_100,
  rating: 4.7,
  iapCount: 4,
  metaAdCount: 6,
  metaAdCountPrior: 2,
  chartRankPrior: 78,
  priorDays: 7,
  updatedAt: new Date("2026-06-28T00:00:00.000Z"),
  releasedAt: new Date("2026-05-17T00:00:00.000Z"),
  categoryAppCount: 35,
  ...over,
});

describe("computeConfidenceScore", () => {
  it("scores complete, fresh, large samples as high confidence", () => {
    const confidence = computeConfidenceScore({
      sources: [
        { status: "available", weight: 2 },
        { status: "available", weight: 2 },
        { status: "available", weight: 1 },
      ],
      sampleSize: 2_000,
      observedAt: new Date("2026-06-30T00:00:00.000Z"),
      now,
      agreement: "available",
    });

    expect(confidence).toEqual({ value: 100, label: "High" });
  });

  it("lowers confidence for missing source coverage and stale samples", () => {
    const confidence = computeConfidenceScore({
      sources: [
        { status: "available", weight: 2 },
        { status: "unavailable", weight: 2 },
        { status: "partial", weight: 1 },
      ],
      sampleSize: null,
      observedAt: new Date("2026-05-01T00:00:00.000Z"),
      now,
      agreement: "partial",
    });

    expect(confidence.value).toBe(36);
    expect(confidence.label).toBe("Low");
  });
});

describe("buildAuditReport", () => {
  const app = {
    id: "apple:6478234567",
    store: "apple" as const,
    storeAppId: "6478234567",
    title: "FocusFlow AI",
    developer: "Nova Labs",
    iconUrl: null,
    category: "Productivity",
  };

  it("builds a typed Momentum report with evidence", () => {
    const report = buildAuditReport({
      app,
      signals: signals(),
      observedAt: new Date("2026-06-30T00:00:00.000Z"),
      now,
    });

    expect(report.app.title).toBe("FocusFlow AI");
    expect(report.subScores).toHaveLength(1);
    expect(report.subScores[0]!.name).toBe("Momentum");
    expect(report.subScores[0]!.value).toBeGreaterThan(50);
    expect(report.confidence.label).toBe("High");
    expect(report.evidence[0]!.sourceStatus).toBe("available");
  });

  it("keeps missing inputs null and lowers confidence instead of fabricating zeroes", () => {
    const report = buildAuditReport({
      app,
      signals: signals({
        reviewCountPrior: null,
        chartRank: null,
        chartRankPrior: null,
        metaAdCountPrior: null,
        updatedAt: null,
      }),
      observedAt: null,
      now,
    });

    const inputs = report.evidence[0]!.inputs;
    expect(inputs.find((i) => i.label === "Prior review count")?.value).toBeNull();
    expect(inputs.find((i) => i.label === "Chart rank")?.value).toBeNull();
    expect(report.evidence[0]!.sourceStatus).toBe("partial");
    expect(report.confidence.label).toBe("Low");
  });
});

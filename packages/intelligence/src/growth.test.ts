import { describe, expect, it } from "vitest";
import {
  computeGrowthScore,
  isFirstMover,
  reviewGrowth7d,
} from "./growth.js";
import type { AppSignals, GrowthSample } from "./types.js";

function sample(date: string, reviewCount: number, chartRank: number | null = null): GrowthSample {
  return { date, reviewCount, chartRank };
}

function signals(samples: GrowthSample[], coveredDays = samples.length): AppSignals {
  const latest = samples.at(-1) ?? sample("2026-06-08", 0);
  return {
    category: "Productivity",
    chartRank: latest.chartRank,
    reviewCount: latest.reviewCount,
    reviewCountPrior: samples[0]?.reviewCount ?? null,
    rating: 4.5,
    iapCount: 2,
    metaAdCount: 0,
    metaAdCountPrior: 0,
    chartRankPrior: samples[0]?.chartRank ?? null,
    updatedAt: null,
    releasedAt: new Date("2026-05-01T00:00:00Z"),
    categoryAppCount: 20,
    growthWindow: {
      period: "7d",
      periodDays: 7,
      startDate: "2026-06-01",
      endDate: "2026-06-08",
      coveredDays,
      requiredDays: 5,
      samples,
    },
  };
}

describe("Growth signal", () => {
  it("returns null while the window is below the coverage gate", () => {
    const sparse = signals(
      [
        sample("2026-06-01", 100),
        sample("2026-06-03", 130),
        sample("2026-06-06", 160),
        sample("2026-06-08", 200),
      ],
      4,
    );

    expect(computeGrowthScore(sparse, "7d")).toBeNull();
    expect(reviewGrowth7d(sparse)).toBeNull();
    expect(isFirstMover(sparse, computeGrowthScore(sparse, "7d"))).toBe(false);
  });

  it("computes a covered span from every present Snapshot day", () => {
    const covered = signals([
      sample("2026-06-01", 100, 80),
      sample("2026-06-02", 110, 72),
      sample("2026-06-03", 120, 64),
      sample("2026-06-04", 130, 56),
      sample("2026-06-05", 140, 48),
      sample("2026-06-06", 150, 40),
      sample("2026-06-07", 160, 32),
      sample("2026-06-08", 170, 24),
    ]);

    expect(computeGrowthScore(covered, "7d")).toBeGreaterThan(50);
    expect(reviewGrowth7d(covered)).toBe(70);
  });

  it("uses the full span, so a one-day endpoint spike scores lower than steady growth", () => {
    const spike = signals([
      sample("2026-06-01", 100),
      sample("2026-06-02", 100),
      sample("2026-06-03", 100),
      sample("2026-06-04", 100),
      sample("2026-06-05", 100),
      sample("2026-06-06", 100),
      sample("2026-06-07", 100),
      sample("2026-06-08", 112),
    ]);
    const steady = signals([
      sample("2026-06-01", 100),
      sample("2026-06-02", 102),
      sample("2026-06-03", 103),
      sample("2026-06-04", 105),
      sample("2026-06-05", 107),
      sample("2026-06-06", 109),
      sample("2026-06-07", 110),
      sample("2026-06-08", 112),
    ]);

    expect(computeGrowthScore(spike, "7d")).toBeLessThan(
      computeGrowthScore(steady, "7d") ?? 0,
    );
  });
});

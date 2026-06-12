import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeGrowthScore, isFirstMover, reviewGrowth7d } from "../growth.js";
import type { AppSignals } from "../types.js";

const baseSignals: AppSignals = {
  category: "Productivity",
  chartRank: 10,
  reviewCount: 1000,
  reviewCountPrior: 900,
  rating: 4.5,
  iapCount: 2,
  metaAdCount: 3,
  metaAdCountPrior: 2,
  chartRankPrior: 15,
  updatedAt: new Date("2024-06-10"),
  releasedAt: new Date("2023-01-01"),
  categoryAppCount: 50,
};

describe("growth scoring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12"));
  });

  describe("computeGrowthScore", () => {
    it("computes score between 0 and 100", () => {
      const score = computeGrowthScore(baseSignals, "7d");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("returns higher score for improving apps", () => {
      const improving: AppSignals = {
        ...baseSignals,
        reviewCount: 1000,
        reviewCountPrior: 500,
        chartRank: 5,
        chartRankPrior: 15,
        updatedAt: new Date("2024-06-10"),
      };
      const score = computeGrowthScore(improving, "7d");
      expect(score).toBeGreaterThan(50);
    });

    it("returns lower score for declining apps", () => {
      const declining: AppSignals = {
        ...baseSignals,
        reviewCount: 500,
        reviewCountPrior: 1000,
        chartRank: 20,
        chartRankPrior: 5,
        updatedAt: new Date("2024-02-01"),
      };
      const score = computeGrowthScore(declining, "7d");
      expect(score).toBeLessThan(50);
    });

    it("handles null prior values gracefully", () => {
      const noHistory: AppSignals = {
        ...baseSignals,
        reviewCountPrior: null,
        chartRankPrior: null,
      };
      const score = computeGrowthScore(noHistory, "7d");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("respects different growth periods", () => {
      const score7d = computeGrowthScore(baseSignals, "7d");
      const score30d = computeGrowthScore(baseSignals, "30d");
      expect(score7d).toBeDefined();
      expect(score30d).toBeDefined();
    });

    it("penalizes stale apps", () => {
      const stale: AppSignals = {
        ...baseSignals,
        updatedAt: new Date("2023-12-01"),
      };
      const recent: AppSignals = {
        ...baseSignals,
        updatedAt: new Date("2024-06-10"),
      };
      const staleScore = computeGrowthScore(stale, "7d");
      const recentScore = computeGrowthScore(recent, "7d");
      expect(recentScore).toBeGreaterThan(staleScore);
    });

    it("handles zero review count", () => {
      const zeroReviews: AppSignals = {
        ...baseSignals,
        reviewCount: 0,
        reviewCountPrior: 0,
      };
      const score = computeGrowthScore(zeroReviews, "7d");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("reviewGrowth7d", () => {
    it("calculates review delta", () => {
      const delta = reviewGrowth7d(baseSignals);
      expect(delta).toBe(100);
    });

    it("returns zero when no prior data", () => {
      const noPrior: AppSignals = {
        ...baseSignals,
        reviewCountPrior: null,
      };
      const delta = reviewGrowth7d(noPrior);
      expect(delta).toBe(0);
    });

    it("handles negative growth", () => {
      const declining: AppSignals = {
        ...baseSignals,
        reviewCount: 800,
        reviewCountPrior: 1000,
      };
      const delta = reviewGrowth7d(declining);
      expect(delta).toBe(-200);
    });
  });

  describe("isFirstMover", () => {
    it("identifies first movers", () => {
      const firstMover: AppSignals = {
        ...baseSignals,
        releasedAt: new Date("2024-05-15"),
        categoryAppCount: 20,
      };
      const result = isFirstMover(firstMover, 70);
      expect(result).toBe(true);
    });

    it("rejects low growth score", () => {
      const lowGrowth: AppSignals = {
        ...baseSignals,
        releasedAt: new Date("2024-05-15"),
      };
      const result = isFirstMover(lowGrowth, 50);
      expect(result).toBe(false);
    });

    it("rejects saturated categories", () => {
      const saturated: AppSignals = {
        ...baseSignals,
        releasedAt: new Date("2024-05-15"),
        categoryAppCount: 100,
      };
      const result = isFirstMover(saturated, 75);
      expect(result).toBe(false);
    });

    it("rejects old apps", () => {
      const old: AppSignals = {
        ...baseSignals,
        releasedAt: new Date("2023-01-01"),
        categoryAppCount: 20,
      };
      const result = isFirstMover(old, 75);
      expect(result).toBe(false);
    });

    it("requires release date", () => {
      const noRelease: AppSignals = {
        ...baseSignals,
        releasedAt: null,
        categoryAppCount: 20,
      };
      const result = isFirstMover(noRelease, 75);
      expect(result).toBe(false);
    });

    it("handles boundary: 90 days since release", () => {
      const boundaryApp: AppSignals = {
        ...baseSignals,
        releasedAt: new Date("2024-03-14"),
        categoryAppCount: 20,
      };
      const result = isFirstMover(boundaryApp, 70);
      expect(result).toBe(true);
    });

    it("rejects apps released >90 days ago", () => {
      const tooOld: AppSignals = {
        ...baseSignals,
        releasedAt: new Date("2024-03-13"),
        categoryAppCount: 20,
      };
      const result = isFirstMover(tooOld, 70);
      expect(result).toBe(false);
    });
  });
});

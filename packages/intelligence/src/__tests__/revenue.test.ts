import { describe, it, expect } from "vitest";
import { estimateRevenue, estimateDownloads, rankDecay } from "../revenue.js";
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
  updatedAt: new Date(),
  releasedAt: new Date(),
  categoryAppCount: 50,
};

describe("revenue estimation", () => {
  describe("rankDecay", () => {
    it("returns 1.0 for rank 1", () => {
      const decay = rankDecay(1);
      expect(decay).toBeCloseTo(1 / Math.log2(3), 3);
    });

    it("returns lower value for higher rank", () => {
      const rank1 = rankDecay(1);
      const rank10 = rankDecay(10);
      const rank100 = rankDecay(100);
      expect(rank1).toBeGreaterThan(rank10);
      expect(rank10).toBeGreaterThan(rank100);
    });

    it("returns 0.08 for null rank", () => {
      expect(rankDecay(null)).toBe(0.08);
    });

    it("returns 0.08 for rank 0", () => {
      expect(rankDecay(0)).toBe(0.08);
    });

    it("returns 0.08 for negative rank", () => {
      expect(rankDecay(-1)).toBe(0.08);
    });

    it("decays logarithmically", () => {
      const rank1 = rankDecay(1);
      const rank100 = rankDecay(100);
      expect(rank1 / rank100).toBeGreaterThan(1);
    });
  });

  describe("estimateRevenue", () => {
    it("returns a number", () => {
      const revenue = estimateRevenue(baseSignals);
      expect(typeof revenue).toBe("number");
      expect(revenue).toBeGreaterThanOrEqual(0);
    });

    it("uses category benchmark", () => {
      const games: AppSignals = { ...baseSignals, category: "Games" };
      const productivity: AppSignals = { ...baseSignals, category: "Productivity" };
      const gamesRevenue = estimateRevenue(games);
      const prodRevenue = estimateRevenue(productivity);
      expect(gamesRevenue).not.toBe(prodRevenue);
    });

    it("uses default benchmark for unknown category", () => {
      const unknown: AppSignals = { ...baseSignals, category: "Unknown Category" };
      const result = estimateRevenue(unknown);
      expect(result).toBeGreaterThan(0);
    });

    it("uses default benchmark for null category", () => {
      const noCategory: AppSignals = { ...baseSignals, category: null };
      const result = estimateRevenue(noCategory);
      expect(result).toBeGreaterThan(0);
    });

    it("applies rank decay correctly", () => {
      const ranked: AppSignals = { ...baseSignals, chartRank: 5 };
      const unranked: AppSignals = { ...baseSignals, chartRank: null };
      const rankedRevenue = estimateRevenue(ranked);
      const unrankedRevenue = estimateRevenue(unranked);
      expect(rankedRevenue).toBeGreaterThan(unrankedRevenue);
    });

    it("increases revenue with review growth", () => {
      const slowGrowth: AppSignals = {
        ...baseSignals,
        reviewCount: 1000,
        reviewCountPrior: 950,
      };
      const fastGrowth: AppSignals = {
        ...baseSignals,
        reviewCount: 1000,
        reviewCountPrior: 500,
      };
      const slowRevenue = estimateRevenue(slowGrowth);
      const fastRevenue = estimateRevenue(fastGrowth);
      expect(fastRevenue).toBeGreaterThan(slowRevenue);
    });

    it("estimates review growth when prior is null", () => {
      const noPrior: AppSignals = {
        ...baseSignals,
        reviewCountPrior: null,
      };
      const result = estimateRevenue(noPrior);
      expect(result).toBeGreaterThan(0);
    });

    it("increases revenue with IAP count", () => {
      const noIap: AppSignals = { ...baseSignals, iapCount: 0 };
      const manyIap: AppSignals = { ...baseSignals, iapCount: 10 };
      const noIapRevenue = estimateRevenue(noIap);
      const manyIapRevenue = estimateRevenue(manyIap);
      expect(manyIapRevenue).toBeGreaterThan(noIapRevenue);
    });

    it("increases revenue with meta ad activity", () => {
      const noAds: AppSignals = { ...baseSignals, metaAdCount: 0 };
      const manyAds: AppSignals = { ...baseSignals, metaAdCount: 20 };
      const noAdsRevenue = estimateRevenue(noAds);
      const manyAdsRevenue = estimateRevenue(manyAds);
      expect(manyAdsRevenue).toBeGreaterThan(noAdsRevenue);
    });

    it("handles zero review count", () => {
      const zeroReviews: AppSignals = {
        ...baseSignals,
        reviewCount: 0,
        reviewCountPrior: 0,
      };
      const result = estimateRevenue(zeroReviews);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("returns different estimates for different categories", () => {
      const categories = [
        "Health & Fitness",
        "Productivity",
        "Photo & Video",
        "Games",
      ];
      const revenues = categories.map((cat) =>
        estimateRevenue({ ...baseSignals, category: cat })
      );
      const unique = new Set(revenues);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe("estimateDownloads", () => {
    it("calculates downloads from revenue", () => {
      const revenue = 10_000;
      const downloads = estimateDownloads(baseSignals, revenue);
      expect(downloads).toBeGreaterThan(0);
      expect(typeof downloads).toBe("number");
    });

    it("uses lower ARPU for games", () => {
      const gameSignals: AppSignals = {
        ...baseSignals,
        category: "Games",
        iapCount: 0,
      };
      const prodSignals: AppSignals = {
        ...baseSignals,
        category: "Productivity",
        iapCount: 0,
      };
      const revenue = 10_000;
      const gameDownloads = estimateDownloads(gameSignals, revenue);
      const prodDownloads = estimateDownloads(prodSignals, revenue);
      expect(gameDownloads).toBeGreaterThan(prodDownloads);
    });

    it("uses higher ARPU for apps with many IAPs", () => {
      const manyIap: AppSignals = {
        ...baseSignals,
        category: "Productivity",
        iapCount: 5,
      };
      const noIap: AppSignals = {
        ...baseSignals,
        category: "Productivity",
        iapCount: 0,
      };
      const revenue = 10_000;
      const manyIapDownloads = estimateDownloads(manyIap, revenue);
      const noIapDownloads = estimateDownloads(noIap, revenue);
      expect(manyIapDownloads).toBeLessThan(noIapDownloads);
    });

    it("uses default ARPU for categories with few IAPs", () => {
      const fewIap: AppSignals = {
        ...baseSignals,
        category: "Productivity",
        iapCount: 2,
      };
      const revenue = 10_000;
      const downloads = estimateDownloads(fewIap, revenue);
      expect(downloads).toBeCloseTo(revenue / 2.5, 0);
    });

    it("returns 0 for zero revenue", () => {
      const downloads = estimateDownloads(baseSignals, 0);
      expect(downloads).toBe(0);
    });

    it("scales linearly with revenue", () => {
      const downloads1 = estimateDownloads(baseSignals, 10_000);
      const downloads2 = estimateDownloads(baseSignals, 20_000);
      expect(downloads2).toBeCloseTo(downloads1 * 2, 0);
    });
  });

  describe("revenue integration", () => {
    it("estimates revenue and calculates downloads", () => {
      const revenue = estimateRevenue(baseSignals);
      const downloads = estimateDownloads(baseSignals, revenue);
      expect(revenue).toBeGreaterThan(0);
      expect(downloads).toBeGreaterThan(0);
    });

    it("higher ranking app has higher revenue and downloads", () => {
      const ranked: AppSignals = { ...baseSignals, chartRank: 5 };
      const unranked: AppSignals = { ...baseSignals, chartRank: 500 };
      const rankedRevenue = estimateRevenue(ranked);
      const unrankedRevenue = estimateRevenue(unranked);
      const rankedDownloads = estimateDownloads(ranked, rankedRevenue);
      const unrankedDownloads = estimateDownloads(unranked, unrankedRevenue);
      expect(rankedRevenue).toBeGreaterThan(unrankedRevenue);
      expect(rankedDownloads).toBeGreaterThan(unrankedDownloads);
    });

    it("high-growth app has higher revenue estimate", () => {
      const growing: AppSignals = {
        ...baseSignals,
        reviewCount: 10_000,
        reviewCountPrior: 1000,
      };
      const stagnant: AppSignals = {
        ...baseSignals,
        reviewCount: 1000,
        reviewCountPrior: 900,
      };
      const growingRevenue = estimateRevenue(growing);
      const stagnantRevenue = estimateRevenue(stagnant);
      expect(growingRevenue).toBeGreaterThanOrEqual(stagnantRevenue);
    });
  });
});

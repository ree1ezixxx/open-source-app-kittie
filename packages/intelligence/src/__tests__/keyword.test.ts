import { describe, it, expect } from "vitest";
import { computeKeywordDifficulty } from "../keyword.js";
import type { KeywordDifficultyInput } from "../types.js";

const baseInput: KeywordDifficultyInput = {
  keyword: "photo editor",
  country: "US",
  store: "apple",
  topRankedApps: [
    { title: "App 1", iconUrl: null, reviewCount: 100_000, rating: 4.5, rank: 1 },
    { title: "App 2", iconUrl: null, reviewCount: 80_000, rating: 4.3, rank: 2 },
    { title: "App 3", iconUrl: null, reviewCount: 60_000, rating: 4.2, rank: 3 },
    { title: "App 4", iconUrl: null, reviewCount: 50_000, rating: 4.0, rank: 4 },
    { title: "App 5", iconUrl: null, reviewCount: 40_000, rating: 3.9, rank: 5 },
    { title: "App 6", iconUrl: null, reviewCount: 30_000, rating: 3.8, rank: 6 },
    { title: "App 7", iconUrl: null, reviewCount: 20_000, rating: 3.7, rank: 7 },
    { title: "App 8", iconUrl: null, reviewCount: 15_000, rating: 3.6, rank: 8 },
    { title: "App 9", iconUrl: null, reviewCount: 10_000, rating: 3.5, rank: 9 },
    { title: "App 10", iconUrl: null, reviewCount: 5_000, rating: 3.4, rank: 10 },
  ],
};

describe("keyword difficulty", () => {
  describe("computeKeywordDifficulty", () => {
    it("returns KeywordDifficulty structure with all fields", () => {
      const result = computeKeywordDifficulty(baseInput);
      expect(result).toHaveProperty("keyword", baseInput.keyword);
      expect(result).toHaveProperty("country", baseInput.country);
      expect(result).toHaveProperty("store", baseInput.store);
      expect(result).toHaveProperty("difficulty");
      expect(result).toHaveProperty("popularity");
      expect(result).toHaveProperty("trafficScore");
      expect(result).toHaveProperty("competingAppCount");
      expect(result).toHaveProperty("topApps");
    });

    it("calculates difficulty 0-100", () => {
      const result = computeKeywordDifficulty(baseInput);
      expect(result.difficulty).toBeGreaterThanOrEqual(0);
      expect(result.difficulty).toBeLessThanOrEqual(100);
    });

    it("calculates popularity based on difficulty and app count", () => {
      const result = computeKeywordDifficulty(baseInput);
      expect(result.popularity).toBeGreaterThanOrEqual(0);
      expect(result.popularity).toBeLessThanOrEqual(100);
    });

    it("calculates trafficScore as 85% of popularity", () => {
      const result = computeKeywordDifficulty(baseInput);
      expect(result.trafficScore).toBe(Math.round(result.popularity * 0.85));
    });

    it("counts competing apps up to 10", () => {
      const result = computeKeywordDifficulty(baseInput);
      expect(result.competingAppCount).toBe(10);
    });

    it("uses subset when fewer than 10 apps provided", () => {
      const fewApps: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: baseInput.topRankedApps.slice(0, 5),
      };
      const result = computeKeywordDifficulty(fewApps);
      expect(result.competingAppCount).toBe(5);
      expect(result.topApps.length).toBe(5);
    });

    it("handles empty app list", () => {
      const noApps: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: [],
      };
      const result = computeKeywordDifficulty(noApps);
      expect(result.competingAppCount).toBe(0);
      expect(result.difficulty).toBe(0);
    });

    it("returns higher difficulty for competitive keywords", () => {
      const competitive: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: baseInput.topRankedApps.map((app) => ({
          ...app,
          reviewCount: 500_000,
        })),
      };
      const result = computeKeywordDifficulty(competitive);
      expect(result.difficulty).toBeGreaterThan(50);
    });

    it("returns lower difficulty for niche keywords", () => {
      const niche: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: baseInput.topRankedApps.slice(0, 3).map((app) => ({
          ...app,
          reviewCount: 1_000,
        })),
      };
      const result = computeKeywordDifficulty(niche);
      expect(result.difficulty).toBeLessThan(50);
    });

    it("caps difficulty at 100", () => {
      const highReviews: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: Array.from({ length: 10 }, (_, i) => ({
          title: `App ${i}`,
          iconUrl: null,
          reviewCount: 1_000_000,
          rating: 4.5,
          rank: i + 1,
        })),
      };
      const result = computeKeywordDifficulty(highReviews);
      expect(result.difficulty).toBeLessThanOrEqual(100);
    });

    it("preserves top apps in result", () => {
      const result = computeKeywordDifficulty(baseInput);
      expect(result.topApps).toHaveLength(10);
      expect(result.topApps[0]).toEqual(baseInput.topRankedApps[0]);
    });

    it("handles edge: single app", () => {
      const singleAppList = [
        { title: "App 1", iconUrl: null, reviewCount: 100_000, rating: 4.5, rank: 1 },
      ];
      const singleApp: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: singleAppList,
      };
      const result = computeKeywordDifficulty(singleApp);
      expect(result.competingAppCount).toBe(1);
      expect(result.difficulty).toBeGreaterThan(0);
    });

    it("proportional to review count", () => {
      const lowReviews: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: baseInput.topRankedApps.map((app) => ({
          ...app,
          reviewCount: 1_000,
        })),
      };
      const highReviews: KeywordDifficultyInput = {
        ...baseInput,
        topRankedApps: baseInput.topRankedApps.map((app) => ({
          ...app,
          reviewCount: 100_000,
        })),
      };
      const lowResult = computeKeywordDifficulty(lowReviews);
      const highResult = computeKeywordDifficulty(highReviews);
      expect(highResult.difficulty).toBeGreaterThan(lowResult.difficulty);
    });
  });
});

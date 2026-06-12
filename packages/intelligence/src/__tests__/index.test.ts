import { describe, it, expect, beforeEach, vi } from "vitest";
import { scoreApp } from "../index.js";
import type { AppListItem } from "@kittie/types";
import type { AppSignals } from "../types.js";

const baseListItem: Omit<
  AppListItem,
  | "reviewGrowth7d"
  | "downloadsEstimate30d"
  | "revenueEstimate30d"
  | "growthScore"
  | "isFirstMover"
> = {
  id: "test-app",
  storeAppId: "12345",
  title: "Test App",
  category: "Productivity",
  store: "apple",
  rating: 4.5,
  reviewCount: 1000,
  iconUrl: "https://example.com/icon.png",
  developer: "Test Dev",
  releasedAt: "2023-01-01",
  updatedAt: "2024-06-10",
};

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

describe("scoreApp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12"));
  });

  it("enriches app with all scoring fields", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(scored).toHaveProperty("reviewGrowth7d");
    expect(scored).toHaveProperty("downloadsEstimate30d");
    expect(scored).toHaveProperty("revenueEstimate30d");
    expect(scored).toHaveProperty("growthScore");
    expect(scored).toHaveProperty("isFirstMover");
  });

  it("preserves original fields", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(scored.id).toBe(baseListItem.id);
    expect(scored.title).toBe(baseListItem.title);
    expect(scored.category).toBe(baseListItem.category);
    expect(scored.store).toBe(baseListItem.store);
  });

  it("calculates reviewGrowth7d", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(scored.reviewGrowth7d).toBe(100);
  });

  it("calculates revenueEstimate30d", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(scored.revenueEstimate30d).toBeGreaterThan(0);
    expect(typeof scored.revenueEstimate30d).toBe("number");
  });

  it("calculates downloadsEstimate30d from revenue", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(scored.downloadsEstimate30d).toBeGreaterThan(0);
    expect(typeof scored.downloadsEstimate30d).toBe("number");
  });

  it("calculates growthScore 0-100", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(scored.growthScore).toBeGreaterThanOrEqual(0);
    expect(scored.growthScore).toBeLessThanOrEqual(100);
  });

  it("calculates isFirstMover boolean", () => {
    const scored = scoreApp(baseListItem, baseSignals);
    expect(typeof scored.isFirstMover).toBe("boolean");
  });

  it("identifies growing apps correctly", () => {
    const growing: AppSignals = {
      ...baseSignals,
      reviewCount: 2000,
      reviewCountPrior: 500,
      chartRank: 5,
      chartRankPrior: 20,
      updatedAt: new Date("2024-06-10"),
    };
    const scored = scoreApp(baseListItem, growing);
    expect(scored.growthScore).toBeGreaterThan(70);
    expect(scored.reviewGrowth7d).toBeGreaterThan(1000);
  });

  it("handles declining apps", () => {
    const declining: AppSignals = {
      ...baseSignals,
      reviewCount: 500,
      reviewCountPrior: 1500,
      chartRank: 50,
      chartRankPrior: 10,
    };
    const scored = scoreApp(baseListItem, declining);
    expect(scored.growthScore).toBeLessThan(50);
    expect(scored.reviewGrowth7d).toBeLessThan(0);
  });

  it("returns consistent results", () => {
    const scored1 = scoreApp(baseListItem, baseSignals);
    const scored2 = scoreApp(baseListItem, baseSignals);
    expect(scored1.growthScore).toBe(scored2.growthScore);
    expect(scored1.revenueEstimate30d).toBe(scored2.revenueEstimate30d);
    expect(scored1.downloadsEstimate30d).toBe(scored2.downloadsEstimate30d);
  });

  it("estimates different revenues for different categories", () => {
    const prodSignals: AppSignals = { ...baseSignals, category: "Productivity" };
    const gameSignals: AppSignals = { ...baseSignals, category: "Games" };
    const scoredProd = scoreApp(baseListItem, prodSignals);
    const scoredGame = scoreApp(baseListItem, gameSignals);
    expect(scoredProd.revenueEstimate30d).not.toBe(scoredGame.revenueEstimate30d);
  });

  it("handles null prior data gracefully", () => {
    const noPrior: AppSignals = {
      ...baseSignals,
      reviewCountPrior: null,
      chartRankPrior: null,
      metaAdCountPrior: null,
    };
    const scored = scoreApp(baseListItem, noPrior);
    expect(scored.growthScore).toBeGreaterThanOrEqual(0);
    expect(scored.revenueEstimate30d).toBeGreaterThanOrEqual(0);
    expect(scored.downloadsEstimate30d).toBeGreaterThanOrEqual(0);
  });

  it("recognizes first movers when criteria met", () => {
    const firstMoverSignals: AppSignals = {
      ...baseSignals,
      releasedAt: new Date("2024-05-15"),
      categoryAppCount: 20,
    };
    const scored = scoreApp(baseListItem, firstMoverSignals);
    expect(scored.isFirstMover).toBe(true);
  });

  it("rejects first movers when growth score too low", () => {
    const newAppLowGrowth: AppSignals = {
      ...baseSignals,
      releasedAt: new Date("2024-05-15"),
      categoryAppCount: 20,
      reviewCount: 10,
      reviewCountPrior: 8,
      chartRank: 500,
      chartRankPrior: 510,
      updatedAt: new Date("2024-02-01"),
    };
    const scored = scoreApp(baseListItem, newAppLowGrowth);
    expect(scored.isFirstMover).toBe(false);
  });

  it("calculates downloads proportional to revenue", () => {
    const lowRevenue: AppSignals = { ...baseSignals, chartRank: 500 };
    const highRevenue: AppSignals = { ...baseSignals, chartRank: 1 };
    const lowScored = scoreApp(baseListItem, lowRevenue);
    const highScored = scoreApp(baseListItem, highRevenue);
    expect(highScored.downloadsEstimate30d ?? 0).toBeGreaterThan(
      lowScored.downloadsEstimate30d ?? 0
    );
  });

  it("scores highly for high-performing apps", () => {
    const topApp: AppSignals = {
      ...baseSignals,
      chartRank: 1,
      reviewCount: 500_000,
      reviewCountPrior: 400_000,
      iapCount: 5,
      metaAdCount: 10,
      updatedAt: new Date("2024-06-10"),
    };
    const scored = scoreApp(baseListItem, topApp);
    expect(scored.growthScore).toBeGreaterThan(70);
    expect(scored.revenueEstimate30d).toBeGreaterThan(50_000);
    expect(scored.downloadsEstimate30d).toBeGreaterThan(10_000);
  });

  it("scores low for struggling apps", () => {
    const struggling: AppSignals = {
      ...baseSignals,
      chartRank: null,
      reviewCount: 50,
      reviewCountPrior: 100,
      iapCount: 0,
      metaAdCount: 0,
      updatedAt: new Date("2023-01-01"),
    };
    const scored = scoreApp(baseListItem, struggling);
    expect(scored.growthScore).toBeLessThan(30);
    expect(scored.revenueEstimate30d).toBeLessThan(10_000);
  });
});

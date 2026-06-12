import { describe, it, expect } from "vitest";
import { signalsFromContext } from "../signals.js";
import type { SnapshotContext } from "@kittie/db";

const baseContext = {
  app: {
    id: "test-app",
    title: "Test App",
    developer: "Test Dev",
    store: "apple",
    category: "Productivity",
    updatedAt: new Date("2024-06-10"),
    releasedAt: new Date("2023-06-01"),
  },
  latest: {
    appId: "test-app",
    snapshotDate: "2024-06-10",
    reviewCount: 1000,
    rating: 4.5,
    chartRank: 10,
  },
  prior: {
    appId: "test-app",
    snapshotDate: "2024-06-03",
    reviewCount: 900,
    rating: 4.4,
    chartRank: 15,
  },
  iapCount: 2,
  metaAdCount: 3,
  metaAdCountPrior: 2,
  categoryAppCount: 50,
} as unknown as SnapshotContext;

describe("signals", () => {
  describe("signalsFromContext", () => {
    it("maps all required fields", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals).toHaveProperty("category", "Productivity");
      expect(signals).toHaveProperty("chartRank", 10);
      expect(signals).toHaveProperty("reviewCount", 1000);
      expect(signals).toHaveProperty("rating", 4.5);
      expect(signals).toHaveProperty("iapCount", 2);
      expect(signals).toHaveProperty("metaAdCount", 3);
      expect(signals).toHaveProperty("updatedAt");
      expect(signals).toHaveProperty("releasedAt");
      expect(signals).toHaveProperty("categoryAppCount", 50);
    });

    it("extracts prior snapshot data", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals.reviewCountPrior).toBe(900);
      expect(signals.chartRankPrior).toBe(15);
      expect(signals.metaAdCountPrior).toBe(2);
    });

    it("handles missing prior snapshot", () => {
      const noPrior: SnapshotContext = {
        ...baseContext,
        prior: null,
        metaAdCountPrior: null,
      };
      const signals = signalsFromContext(noPrior);
      expect(signals.reviewCountPrior).toBe(null);
      expect(signals.chartRankPrior).toBe(null);
      expect(signals.metaAdCountPrior).toBe(null);
    });

    it("preserves dates", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals.updatedAt).toEqual(baseContext.app.updatedAt);
      expect(signals.releasedAt).toEqual(baseContext.app.releasedAt);
    });

    it("handles null release date", () => {
      const noRelease: SnapshotContext = {
        ...baseContext,
        app: { ...baseContext.app, releasedAt: null },
      };
      const signals = signalsFromContext(noRelease);
      expect(signals.releasedAt).toBe(null);
    });

    it("preserves category information", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals.category).toBe("Productivity");
    });

    it("handles null category", () => {
      const noCategory: SnapshotContext = {
        ...baseContext,
        app: { ...baseContext.app, category: null },
      };
      const signals = signalsFromContext(noCategory);
      expect(signals.category).toBe(null);
    });

    it("maps rating from latest snapshot", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals.rating).toBe(baseContext.latest.rating);
    });

    it("maps review count from latest snapshot", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals.reviewCount).toBe(baseContext.latest.reviewCount);
    });

    it("maps chart rank from latest snapshot", () => {
      const signals = signalsFromContext(baseContext);
      expect(signals.chartRank).toBe(baseContext.latest.chartRank);
    });

    it("zero iap count", () => {
      const noIaps: SnapshotContext = {
        ...baseContext,
        iapCount: 0,
      };
      const signals = signalsFromContext(noIaps);
      expect(signals.iapCount).toBe(0);
    });

    it("zero meta ad count", () => {
      const noAds: SnapshotContext = {
        ...baseContext,
        metaAdCount: 0,
        metaAdCountPrior: 0,
      };
      const signals = signalsFromContext(noAds);
      expect(signals.metaAdCount).toBe(0);
    });

    it("different category counts", () => {
      const lowSaturation: SnapshotContext = {
        ...baseContext,
        categoryAppCount: 10,
      };
      const highSaturation: SnapshotContext = {
        ...baseContext,
        categoryAppCount: 500,
      };
      const lowSignals = signalsFromContext(lowSaturation);
      const highSignals = signalsFromContext(highSaturation);
      expect(lowSignals.categoryAppCount).toBe(10);
      expect(highSignals.categoryAppCount).toBe(500);
    });
  });
});

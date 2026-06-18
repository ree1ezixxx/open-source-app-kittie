import { describe, expect, it } from "vitest";

import { computeGrowthPct } from "./growth.js";
import type { AppSignals } from "./types.js";

const signals = (over: Partial<AppSignals>): AppSignals => ({
  category: "Games",
  chartRank: null,
  reviewCount: 100,
  reviewCountPrior: 90,
  rating: 4.5,
  iapCount: 0,
  metaAdCount: 0,
  metaAdCountPrior: null,
  chartRankPrior: null,
  priorDays: 7,
  updatedAt: null,
  releasedAt: null,
  categoryAppCount: 50,
  ...over,
});

describe("computeGrowthPct", () => {
  it("returns null without a prior snapshot", () => {
    expect(computeGrowthPct(signals({ reviewCountPrior: null }), "7d")).toBeNull();
  });

  it.each([
    {
      label: "7d full window",
      s: signals({ reviewCount: 110, reviewCountPrior: 100, priorDays: 7 }),
      period: "7d" as const,
      expected: 10,
    },
    {
      label: "7d partial window scales delta",
      s: signals({ reviewCount: 105, reviewCountPrior: 100, priorDays: 3 }),
      period: "7d" as const,
      expected: 11.7,
    },
    {
      label: "30d period on 7d sample",
      s: signals({ reviewCount: 110, reviewCountPrior: 100, priorDays: 7 }),
      period: "30d" as const,
      expected: 42.9,
    },
    {
      label: "negative growth",
      s: signals({ reviewCount: 95, reviewCountPrior: 100, priorDays: 7 }),
      period: "7d" as const,
      expected: -5,
    },
    {
      label: "truth-shaped ~1.9% on mature base",
      s: signals({ reviewCount: 166_100, reviewCountPrior: 162_940, priorDays: 7 }),
      period: "7d" as const,
      expected: 1.9,
    },
  ])("$label → $expected%", ({ s, period, expected }) => {
    expect(computeGrowthPct(s, period)).toBe(expected);
  });
});

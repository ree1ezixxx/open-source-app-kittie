import { describe, expect, it } from "vitest";

import { computeGrowthPct, computeGrowthScore, growthSourceStatuses } from "./growth.js";
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

describe("computeGrowthScore — source-status reweight (#171)", () => {
  it("strong review growth with NO other signals is not dragged toward 50", () => {
    // reviews-only, big positive delta: missing rank/ads/updates must not dilute.
    const score = computeGrowthScore(
      signals({ reviewCount: 200, reviewCountPrior: 100, priorDays: 7 }),
      "7d",
    );
    expect(score).toBeGreaterThan(80); // old fixed-weight formula would cap ~67
  });

  it("no live signals at all → neutral 50, never 0", () => {
    const score = computeGrowthScore(
      signals({ reviewCountPrior: null, chartRank: null, chartRankPrior: null, updatedAt: null }),
      "7d",
    );
    expect(score).toBe(50);
  });

  it("dormant ads do not change the score (weight redistributed)", () => {
    const base = signals({
      reviewCount: 150,
      reviewCountPrior: 100,
      chartRank: 10,
      chartRankPrior: 25,
      updatedAt: new Date(),
    });
    const withoutAds = computeGrowthScore(base, "7d");
    const adsStubbedZero = computeGrowthScore(
      { ...base, metaAdCount: 0, metaAdCountPrior: null },
      "7d",
    );
    expect(adsStubbedZero).toBe(withoutAds); // ads absent ⇒ ignored, not a 0 drag
  });
});

describe("growthSourceStatuses (#171)", () => {
  it("flags ads unavailable and reviews available from priors", () => {
    const st = growthSourceStatuses(
      signals({ reviewCountPrior: 100, chartRank: 5, chartRankPrior: 9 }),
    );
    expect(st.reviews).toBe("available");
    expect(st.chartRank).toBe("available");
    expect(st.ads).toBe("unavailable");
  });

  it("reviews/rank are partial when current data exists but no prior", () => {
    const st = growthSourceStatuses(
      signals({ reviewCountPrior: null, chartRank: 5, chartRankPrior: null }),
    );
    expect(st.reviews).toBe("partial");
    expect(st.chartRank).toBe("partial");
  });
});

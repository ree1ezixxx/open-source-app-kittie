import { describe, it, expect } from "vitest";
import type { AppDetail, Review } from "@kittie/types";
import { buildTeardownApp } from "./index.js";

const PRESENT_KINDS = ["observed", "modelled", "derived", "inferred"];

/** A full, healthy AppDetail; override any field per test. */
function makeApp(overrides: Partial<AppDetail> = {}): AppDetail {
  return {
    id: "apple:123",
    store: "apple",
    storeAppId: "123",
    title: "Kalshi",
    iconUrl: "https://example.com/icon.png",
    developer: "Kalshi Inc",
    category: "Finance",
    rating: 4.6,
    reviewCount: 12000,
    reviewGrowth7d: 0.04,
    downloadsEstimate30d: 250000,
    revenueEstimate30d: 480000,
    growthScore: 72,
    growthPct: 12,
    downloadsEstimatePrior: 220000,
    revenueEstimatePrior: 410000,
    rankDelta: 3,
    isFirstMover: false,
    releasedAt: "2021-06-01",
    updatedAt: "2026-06-20",
    description: "Trade on events.",
    screenshotUrls: ["https://example.com/s1.png"],
    websiteUrl: "https://kalshi.com",
    supportEmail: null,
    price: 0,
    contentRating: "17+",
    languages: ["en", "es"],
    fileSizeBytes: 120_000_000,
    minOsVersion: "16.0",
    sellerName: "Kalshi Inc",
    iaps: [{ name: "Pro", price: 9.99, currency: "USD" }],
    metaAds: [],
    appleSearchAds: [],
    creators: [],
    historicals: [
      { date: "2026-06-19", reviewCount: 11800, rating: 4.6, chartRank: 14, downloadsEstimate: 240000, revenueEstimate: 460000 },
      { date: "2026-06-20", reviewCount: 12000, rating: 4.6, chartRank: 12, downloadsEstimate: 250000, revenueEstimate: 480000 },
    ],
    ...overrides,
  };
}

const taggedReview = (over: Partial<Review> = {}): Review => ({
  id: "r1",
  appId: "apple:123",
  store: "apple",
  country: "US",
  rating: 2,
  title: "Buggy",
  body: "Crashes on launch and withdrawals are slow.",
  author: "user",
  reviewedAt: "2026-06-18",
  sentiment: "negative",
  topics: ["stability", "withdrawals"],
  improvementAreas: ["reliability"],
  ...over,
});

const OBS = "2026-06-24T00:00:00.000Z";

describe("buildTeardownApp — quick mode", () => {
  it("produces an honest, fully-populated quick teardown for a healthy app", () => {
    const out = buildTeardownApp({ app: makeApp(), reviews: [taggedReview()], observedAt: OBS });

    expect(out.depth).toBe("quick");
    expect(out.identity.title).toBe("Kalshi");
    expect(out.identity.storeUrl).toContain("apps.apple.com");
    expect(out.metrics.revenueEstimate30d).toBe(480000);
    expect(out.metrics.chartRank).toBe(12); // most-recent snapshot, not the older 14
    expect(out.monetisation.priceModel).toBe("freemium"); // price 0 + IAPs
    expect(out.monetisation.iapPriceRange).toEqual({ min: 9.99, max: 9.99 });
    expect(out.agentSummary.length).toBeGreaterThan(40);
    expect(out.risks.length).toBeGreaterThan(0);
    expect(out.reviewInsights?.sampled).toBe(1);
    expect(out.reviewInsights?.sentiment.negative).toBe(1);
    expect(out.reviewInsights?.topImprovementAreas[0]?.label).toBe("reliability");
  });

  it("never fabricates: standard/deep sections are null with a `missing` label in quick", () => {
    const out = buildTeardownApp({ app: makeApp(), observedAt: OBS });
    for (const section of ["thesis", "coreUserProblem", "audience", "coreLoop", "featureMap", "cloneInsights", "reviewClusters", "aso", "screenMap"] as const) {
      expect(out[section]).toBeNull();
      expect(out.labels[section]?.kind).toBe("missing");
      expect(out.labels[section]?.note.length).toBeGreaterThan(0);
    }
    // Modelled estimates must stay labelled modelled — not dressed up as observed.
    expect(out.labels.metrics?.kind).toBe("modelled");
  });

  it("embedded decisionPacket holds the honesty invariants", () => {
    const out = buildTeardownApp({ app: makeApp({ decisionPacket: undefined }), observedAt: OBS });
    const dp = out.decisionPacket;
    expect(dp.confidence.score).toBeGreaterThanOrEqual(0);
    expect(dp.confidence.score).toBeLessThanOrEqual(1);
    for (const e of dp.evidence) {
      expect(PRESENT_KINDS).toContain(e.valueType);
      if (e.valueType === "observed") expect(e.sourceUrl).toBeTruthy(); // citable
    }
    expect(dp.coverage.missing).toContain("Meta advertising data"); // blocked source declared, not faked
  });

  it("degrades honestly on an empty/thin app — no throw, reviewInsights missing", () => {
    const thin = makeApp({
      rating: null,
      reviewCount: 3,
      category: null,
      growthScore: null,
      languages: [],
      historicals: [],
      iaps: [],
      price: null,
      decisionPacket: undefined,
    });
    const out = buildTeardownApp({ app: thin, observedAt: OBS });
    expect(out.reviewInsights).toBeNull();
    expect(out.labels.reviewInsights?.kind).toBe("missing");
    expect(out.monetisation.priceModel).toBe("unknown"); // price null, no IAPs
    expect(out.risks.length).toBeGreaterThan(0); // thin review base etc.
    expect(out.metrics.chartRank).toBeNull();
    expect(out.decisionPacket.snapshotId).toBe(OBS); // falls back to observedAt when no history
  });
});

import { describe, it, expect } from "vitest";
import type { ClusterReviewsRequest } from "@kittie/types";
import {
  CLUSTER_DEFAULTS,
  buildReviewClustersResponse,
  clusterReviews,
  clusterReviewsDeterministic,
  themeTypeForLabel,
  type ClusterInputApp,
  type ClusterInputReview,
} from "./index.js";

const NOW = Date.parse("2026-07-06T00:00:00.000Z");
const daysAgo = (d: number): string => new Date(NOW - d * 86_400_000).toISOString();

const APPS: ClusterInputApp[] = [
  { id: "apple:1", name: "SleepWell" },
  { id: "apple:2", name: "Pillow" },
  { id: "apple:3", name: "ShutEye" },
];

/** A tagged review; overrides let each test shape one field. */
function review(overrides: Partial<ClusterInputReview> = {}): ClusterInputReview {
  return {
    appId: "apple:1",
    rating: 2,
    title: null,
    body: "It says I was in deep sleep when I was clearly awake, totally inaccurate.",
    sentiment: "negative",
    topics: ["App Performance"],
    improvementAreas: ["App Performance"],
    reviewedAt: daysAgo(5),
    ...overrides,
  };
}

function compute(reviews: ClusterInputReview[], params: ClusterReviewsRequest = {}) {
  return clusterReviewsDeterministic({ apps: APPS, reviews, params, nowMs: NOW });
}

describe("clusterReviewsDeterministic", () => {
  it("ranks themes by mention count and reports honest coverage", () => {
    const reviews = [
      ...Array.from({ length: 6 }, (_, i) => review({ appId: `apple:${(i % 3) + 1}` })),
      review({ appId: "apple:2", topics: ["Subscription Pricing"], improvementAreas: ["App Value"], body: "Way too expensive for what it does." }),
    ];
    const { themes, coverage, totalReviewsAnalyzed } = compute(reviews);

    expect(totalReviewsAnalyzed).toBe(7);
    expect(themes[0]?.theme).toBe("App Performance");
    expect(themes[0]?.mentionCount).toBe(6);
    // App Performance maps to a bug theme.
    expect(themes[0]?.type).toBe("bug");
    // Coverage lists every app, including any with zero reviews.
    expect(coverage).toHaveLength(3);
    expect(coverage.every((c) => typeof c.reviewsAnalyzed === "number")).toBe(true);
  });

  it("computes freq, sentiment sign, cross-app spread and quotes without author data", () => {
    const reviews = [
      review({ appId: "apple:1" }),
      review({ appId: "apple:2" }),
      review({ appId: "apple:3" }),
    ];
    const theme = compute(reviews).themes[0]!;
    expect(theme.freq).toBeCloseTo(1, 5);
    expect(theme.sentiment).toBeLessThan(0); // negative reviews → negative mean
    expect(theme.apps.sort()).toEqual(["Pillow", "ShutEye", "SleepWell"]);
    expect(theme.appBreakdown).toHaveLength(3);
    expect(theme.quotes.length).toBeGreaterThan(0);
    // Quote shape carries no author field.
    expect(Object.keys(theme.quotes[0]!).sort()).toEqual(["appId", "appName", "date", "rating", "text"]);
  });

  it("flips a strongly-positive bucket to a praise theme", () => {
    const reviews = Array.from({ length: 5 }, (_, i) =>
      review({ appId: `apple:${(i % 3) + 1}`, rating: 5, sentiment: "positive", topics: ["User Interface"], improvementAreas: [], body: "Gorgeous, intuitive interface — a joy to use." }),
    );
    const theme = compute(reviews).themes[0]!;
    expect(theme.sentiment).toBeGreaterThan(0);
    expect(theme.type).toBe("praise");
  });

  it("respects minThemeFrequency and themeTypes filters", () => {
    const reviews = [
      ...Array.from({ length: 9 }, () => review({ topics: ["App Performance"], improvementAreas: [] })),
      review({ topics: ["Customer Support"], improvementAreas: [], body: "Support never replied." }),
    ];
    // The 1/10 support theme (freq 0.1) survives the default floor...
    expect(compute(reviews).themes.map((t) => t.theme)).toContain("Customer Support");
    // ...but a 0.5 floor drops it.
    expect(compute(reviews, { minThemeFrequency: 0.5 }).themes.map((t) => t.theme)).not.toContain("Customer Support");
    // themeTypes narrows to a single type.
    const bugsOnly = compute(reviews, { themeTypes: ["bug"] }).themes;
    expect(bugsOnly.every((t) => t.type === "bug")).toBe(true);
  });

  it("marks trend unknown when a window has too few dated mentions", () => {
    const theme = compute([review(), review({ appId: "apple:2" })]).themes[0]!;
    expect(theme.trend).toBe("unknown");
  });

  it("detects a rising trend from recent vs prior windows", () => {
    const reviews = [
      ...Array.from({ length: 8 }, (_, i) => review({ appId: `apple:${(i % 3) + 1}`, reviewedAt: daysAgo(5) })),
      ...Array.from({ length: 5 }, (_, i) => review({ appId: `apple:${(i % 3) + 1}`, reviewedAt: daysAgo(45) })),
    ];
    const theme = compute(reviews).themes[0]!;
    expect(theme.trend).toBe("rising");
  });

  it("excludes out-of-window reviews when `since` is set", () => {
    const reviews = [
      review({ reviewedAt: daysAgo(2) }),
      review({ reviewedAt: daysAgo(2) }),
      review({ reviewedAt: daysAgo(400), appId: "apple:2" }),
    ];
    const { totalReviewsAnalyzed } = compute(reviews, { since: daysAgo(30) });
    expect(totalReviewsAnalyzed).toBe(2);
  });

  it("counts untagged reviews in the total but not in any theme", () => {
    const reviews = [
      review(),
      review({ topics: [], improvementAreas: [], sentiment: null }),
    ];
    const { themes, totalReviewsAnalyzed } = compute(reviews);
    expect(totalReviewsAnalyzed).toBe(2);
    expect(themes.reduce((a, t) => a + t.mentionCount, 0)).toBe(1);
  });
});

describe("buildReviewClustersResponse", () => {
  it("wraps into an ok envelope with theme evidence", () => {
    const reviews = Array.from({ length: 12 }, (_, i) => review({ appId: `apple:${(i % 3) + 1}` }));
    const res = clusterReviews({ apps: APPS, reviews, params: { query: "sleep tracking" }, nowMs: NOW }, new Date(NOW).toISOString());
    expect(res.responseType).toBe("review_clusters");
    expect(res.status).toBe("ok");
    expect(res.data.enrichment).toBe("deterministic");
    expect(res.evidence.length).toBeGreaterThan(0);
    expect(res.evidence[0]!.source.type).toBe("review");
    // Deterministic path always carries the "LLM naming unavailable" caveat.
    expect(res.caveats.some((c) => c.kind === "weak_evidence")).toBe(true);
    expect(res.metadata.sourceQuery.query).toBe("sleep tracking");
  });

  it("degrades to insufficient with a missing-source caveat when no reviews exist", () => {
    const res = clusterReviews({ apps: APPS, reviews: [], params: {}, nowMs: NOW }, new Date(NOW).toISOString());
    expect(res.status).toBe("insufficient");
    expect(res.data.themes).toHaveLength(0);
    expect(res.caveats.some((c) => c.kind === "missing_source" && c.sourceType === "review")).toBe(true);
    expect(res.confidence.score).toBe(0);
  });

  it("flags partial coverage when some apps have no reviews", () => {
    const reviews = Array.from({ length: 6 }, () => review({ appId: "apple:1" }));
    const { themes, coverage, totalReviewsAnalyzed } = compute(reviews);
    const res = buildReviewClustersResponse({
      themes,
      coverage,
      totalReviewsAnalyzed,
      apps: APPS,
      params: {},
      enrichment: "llm",
      generatedAt: new Date(NOW).toISOString(),
      modelVersion: "gemini-2.5-flash",
    });
    expect(res.caveats.some((c) => c.kind === "partial_source")).toBe(true);
    expect(res.metadata.modelVersion).toBe("gemini-2.5-flash");
  });
});

describe("themeTypeForLabel", () => {
  it("maps canonical labels and falls through to other", () => {
    expect(themeTypeForLabel("Subscription Pricing")).toBe("pricing");
    expect(themeTypeForLabel("App Performance")).toBe("bug");
    expect(themeTypeForLabel("Features")).toBe("request");
    expect(themeTypeForLabel("User Interface")).toBe("ux");
    expect(themeTypeForLabel("Totally Unknown Label")).toBe("other");
  });
});

describe("CLUSTER_DEFAULTS", () => {
  it("exposes stable bounds callers can reason about", () => {
    expect(CLUSTER_DEFAULTS.limitApps).toBe(10);
    expect(CLUSTER_DEFAULTS.maxLimitApps).toBe(25);
  });
});

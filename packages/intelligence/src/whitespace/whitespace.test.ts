import { describe, it, expect } from "vitest";
import type { AppListItem, FeatureGap, ReviewTheme, SimilarApp } from "@kittie/types";
import {
  WHITESPACE_DEFAULTS,
  buildWhitespaceIdeasResponse,
  prefilterScore,
  scoreWhitespaceIdea,
  type WhitespaceDeepInput,
} from "./index.js";

function app(overrides: Partial<AppListItem> = {}): AppListItem {
  return {
    id: "apple:1",
    store: "apple",
    storeAppId: "1",
    title: "SleepWell",
    iconUrl: null,
    developer: "Dev",
    category: "Health & Fitness",
    rating: 3.2,
    reviewCount: 800,
    reviewGrowth7d: null,
    downloadsEstimate30d: null,
    revenueEstimate30d: 40_000,
    growthScore: 70,
    growthPct: null,
    downloadsEstimatePrior: null,
    revenueEstimatePrior: null,
    rankDelta: null,
    isFirstMover: false,
    releasedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function similar(a: AppListItem, cls: SimilarApp["similarityClass"] = "direct"): SimilarApp {
  return { app: a, similarityScore: 0.8, similarityClass: cls, similarityReasons: ["m"], matchedVia: ["fts_keyword"] };
}

function painTheme(overrides: Partial<ReviewTheme> = {}): ReviewTheme {
  return {
    theme: "inaccurate tracking",
    type: "complaint",
    freq: 0.3,
    mentionCount: 20,
    sentiment: -0.7,
    apps: ["SleepWell"],
    appBreakdown: [{ appId: "apple:1", appName: "SleepWell", mentionCount: 20, avgRating: 2, sentiment: -0.7 }],
    quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 2, text: "Tracking is wildly inaccurate.", date: null }],
    trend: "rising",
    confidence: 0.8,
    ...overrides,
  };
}

function gapFeature(overrides: Partial<FeatureGap> = {}): FeatureGap {
  return {
    feature: "Offline mode",
    coverage: 0.1,
    competitorCount: 1,
    quality: "low",
    demand: "high",
    gap: true,
    gapReason: "Strong gap: high demand, 10% coverage, low quality.",
    tableStakes: false,
    confidence: 0.7,
    evidence: [{ source: "reviews", appId: "apple:1", appName: "SleepWell", text: "please add offline" }],
    ...overrides,
  };
}

function deep(overrides: Partial<WhitespaceDeepInput> = {}): WhitespaceDeepInput {
  return {
    niche: "menopause sleep",
    competitors: [similar(app()), similar(app({ id: "apple:2", title: "Pillow", rating: 3.0, reviewCount: 400 }))],
    themes: [painTheme()],
    features: [gapFeature()],
    reviewsAnalyzed: 60,
    ...overrides,
  };
}

describe("prefilterScore", () => {
  it("is 0 with no competitors and rises with momentum", () => {
    expect(prefilterScore([])).toBe(0);
    const hot = prefilterScore([similar(app({ growthScore: 90 }))]);
    const cold = prefilterScore([similar(app({ growthScore: 5 }))]);
    expect(hot).toBeGreaterThan(cold);
  });

  it("penalises strong, saturated incumbents", () => {
    const weakField = prefilterScore([similar(app({ rating: 2.8, reviewCount: 300 }))]);
    const strongField = prefilterScore(
      Array.from({ length: 20 }, (_, i) => similar(app({ id: `apple:${i}`, rating: 4.9, reviewCount: 500_000 }))),
    );
    expect(weakField).toBeGreaterThan(strongField);
  });
});

describe("scoreWhitespaceIdea", () => {
  it("produces a 0–100 score matching the weighted breakdown (difficulty excluded)", () => {
    const idea = scoreWhitespaceIdea(deep());
    const W = WHITESPACE_DEFAULTS.weights;
    const b = idea.scoreBreakdown;
    const expected = Math.round(
      b.demandVelocity * W.demandVelocity +
        b.incumbentWeakness * W.incumbentWeakness +
        b.sentimentGap * W.sentimentGap +
        b.featureGap * W.featureGap +
        b.monetization * W.monetization,
    );
    expect(idea.score).toBe(expected);
    expect(Object.values(W).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 10);
    expect(idea.score).toBeGreaterThan(0);
    expect(idea.score).toBeLessThanOrEqual(100);
  });

  it("derives tiers, a grounded build angle, and auditable competitor ids", () => {
    const idea = scoreWhitespaceIdea(deep());
    expect(idea.demand).toBe("rising"); // avg growth 70
    expect(idea.incumbentStrength).toBe("medium"); // ~3.1★ over modest bases
    expect(idea.featureGap).not.toBe("unknown");
    expect(idea.suggestedBuildAngle).toContain("Offline mode");
    expect(idea.competitorAppIds).toEqual(["apple:1", "apple:2"]);
    expect(idea.evidence.some((e) => e.source === "reviews")).toBe(true);
    expect(idea.evidence.some((e) => e.source === "features")).toBe(true);
  });

  it("lowers confidence — not components — when evidence is missing", () => {
    const full = scoreWhitespaceIdea(deep());
    const thin = scoreWhitespaceIdea(deep({ themes: [], features: [], reviewsAnalyzed: 0 }));
    expect(thin.confidence).toBeLessThan(full.confidence);
    expect(thin.sentimentGap).toBe("unknown");
    expect(thin.featureGap).toBe("unknown");
    expect(thin.avoidBecause).toContain("No local reviews for this niche — pain/gap signals are ungrounded.");
  });

  it("warns against strong incumbents and falling demand", () => {
    const fortress = scoreWhitespaceIdea(
      deep({
        competitors: Array.from({ length: 5 }, (_, i) =>
          similar(app({ id: `apple:${i}`, rating: 4.9, reviewCount: 900_000, growthScore: 10 })),
        ),
      }),
    );
    expect(fortress.incumbentStrength).toBe("strong");
    expect(fortress.demand).toBe("falling");
    expect(fortress.avoidBecause?.length).toBeGreaterThanOrEqual(2);
  });

  it("reports buildDifficulty from table-stakes surface without scoring it", () => {
    const heavy = scoreWhitespaceIdea(
      deep({
        features: [
          gapFeature(),
          ...Array.from({ length: 6 }, (_, i) =>
            gapFeature({ feature: `Stake ${i}`, gap: false, tableStakes: true, coverage: 0.9, quality: "high", demand: "medium" }),
          ),
        ],
      }),
    );
    const light = scoreWhitespaceIdea(deep());
    expect(heavy.buildDifficulty).toBe("high");
    expect(light.buildDifficulty).toBe("low");
    // identical non-feature inputs → difficulty never moves the composite via weights
    expect(Object.keys(heavy.scoreBreakdown)).not.toContain("buildDifficulty");
  });
});

describe("buildWhitespaceIdeasResponse", () => {
  const funnel = { candidates: 12, prefiltered: 8, deepAnalyzed: 3 };

  it("wraps ranked ideas with funnel counts in an ok envelope", () => {
    const ideas = [scoreWhitespaceIdea(deep()), scoreWhitespaceIdea(deep({ niche: "sleep for shift workers" }))];
    const res = buildWhitespaceIdeasResponse({
      ideas,
      funnel,
      params: { category: "health-behaviour" },
      enrichment: "deterministic",
      generatedAt: "2026-07-06T00:00:00.000Z",
    });
    expect(res.responseType).toBe("whitespace_ideas");
    expect(res.status).toBe("ok");
    expect(res.data.funnel).toEqual(funnel);
    expect(res.evidence).toHaveLength(2);
    expect(res.metadata.sourceQuery.deepAnalyzed).toBe(3);
    expect(res.caveats.some((c) => c.kind === "weak_evidence" && c.sourceType === "model")).toBe(true);
  });

  it("degrades to insufficient when the funnel produced nothing", () => {
    const res = buildWhitespaceIdeasResponse({
      ideas: [],
      funnel: { candidates: 4, prefiltered: 0, deepAnalyzed: 0 },
      params: { category: "underwater basket weaving" },
      enrichment: "deterministic",
      generatedAt: "2026-07-06T00:00:00.000Z",
    });
    expect(res.status).toBe("insufficient");
    expect(res.confidence.score).toBe(0);
  });

  it("flags ideas with no review grounding", () => {
    const ungrounded = scoreWhitespaceIdea(deep({ themes: [], reviewsAnalyzed: 0 }));
    const res = buildWhitespaceIdeasResponse({
      ideas: [ungrounded],
      funnel,
      params: { category: "health" },
      enrichment: "llm",
      generatedAt: "2026-07-06T00:00:00.000Z",
      modelVersion: "gemini-2.5-flash",
    });
    expect(res.caveats.some((c) => c.sourceType === "review")).toBe(true);
    expect(res.metadata.modelVersion).toBe("gemini-2.5-flash");
  });
});

describe("sourceCoverage (#271)", () => {
  const funnel2 = { candidates: 5, prefiltered: 4, deepAnalyzed: 2 };
  it("carries the aggregated deep-set coverage", () => {
    const res = buildWhitespaceIdeasResponse({
      ideas: [scoreWhitespaceIdea(deep())],
      funnel: funnel2,
      sourceCoverage: {
        appsResolved: 6, appsWithReviews: 4, reviewsAnalyzed: 120,
        reviewDateRange: { oldest: "2026-05-01T00:00:00.000Z", newest: "2026-07-01T00:00:00.000Z" },
        localesSeen: ["GB", "US"],
      },
      params: { category: "health" },
      enrichment: "deterministic",
      generatedAt: "2026-07-06T00:00:00.000Z",
    });
    const sc = res.data.sourceCoverage;
    expect(sc.appsResolved).toBe(6);
    expect(sc.localesSeen).toEqual(["GB", "US"]);
    expect(sc.appsWithDescriptions).toBeNull();
    expect(sc.notes[0]).toEqual({ sourceType: "review", status: "partial" });
  });

  it("defaults to honest zeros/nulls when nothing was deep-analysed", () => {
    const res = buildWhitespaceIdeasResponse({
      ideas: [], funnel: { candidates: 2, prefiltered: 0, deepAnalyzed: 0 },
      params: { category: "x" }, enrichment: "deterministic", generatedAt: "2026-07-06T00:00:00.000Z",
    });
    const sc = res.data.sourceCoverage;
    expect(sc).toMatchObject({ appsResolved: 0, reviewsAnalyzed: 0, reviewDateRange: null, localesSeen: [] });
    expect(sc.notes).toEqual([
      { sourceType: "review", status: "missing" },
      { sourceType: "model", status: "missing" },
    ]);
  });
});

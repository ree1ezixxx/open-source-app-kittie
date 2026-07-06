import { describe, it, expect } from "vitest";
import type { FindFeatureGapsRequest, ReviewTheme, ReviewThemeType } from "@kittie/types";
import {
  FEATURE_GAP_DEFAULTS,
  buildFeatureGapsResponse,
  findFeatureGaps,
  findFeatureGapsDeterministic,
  type FeatureInputApp,
} from "./index.js";

function app(id: string, name: string, description: string | null): FeatureInputApp {
  return { id, name, description, category: "Health & Fitness" };
}

function theme(overrides: Partial<ReviewTheme> = {}): ReviewTheme {
  return {
    theme: "Feature Functionality",
    type: "request" as ReviewThemeType,
    freq: 0.2,
    mentionCount: 12,
    sentiment: -0.6,
    apps: ["SleepWell"],
    appBreakdown: [{ appId: "apple:1", appName: "SleepWell", mentionCount: 12, avgRating: 2, sentiment: -0.6 }],
    quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 2, text: "Please add an offline mode, useless without internet.", date: null }],
    trend: "rising",
    confidence: 0.8,
    ...overrides,
  };
}

function compute(apps: FeatureInputApp[], themes: ReviewTheme[], params: FindFeatureGapsRequest = {}) {
  return findFeatureGapsDeterministic({ apps, themes, params });
}

const APPS = [
  app("apple:1", "SleepWell", "Track your sleep with cloud sync across devices and dark mode."),
  app("apple:2", "Pillow", "Beautiful sleep tracking with iCloud sync and Apple Watch support."),
  app("apple:3", "ShutEye", "Sleep sounds and stories. Sync your data. Premium subscription unlocks more."),
];

describe("findFeatureGapsDeterministic", () => {
  it("computes coverage from listing descriptions", () => {
    const { features, coverage } = compute(APPS, []);
    const sync = features.find((f) => f.feature === "Cross-device sync");
    expect(sync?.competitorCount).toBe(3); // all three mention sync
    expect(sync?.coverage).toBeCloseTo(1, 5);
    // per-app coverage lists all apps with description flag
    expect(coverage).toHaveLength(3);
    expect(coverage.every((c) => c.hasDescription)).toBe(true);
  });

  it("flags a strong gap: high demand + low coverage + negative evidence", () => {
    // No app lists 'offline'; a high-frequency request theme demands it.
    const themes = [theme({ freq: 0.3, mentionCount: 20 })];
    const gap = compute(APPS, themes).features.find((f) => f.feature === "Offline mode");
    expect(gap).toBeDefined();
    expect(gap?.coverage).toBe(0);
    expect(gap?.demand).toBe("high");
    expect(gap?.gap).toBe(true);
    expect(gap?.gapReason).toMatch(/high demand/i);
    // gaps rank ahead of non-gaps
    expect(compute(APPS, themes).features[0]?.gap).toBe(true);
  });

  it("marks a well-covered, positively-reviewed feature as table stakes", () => {
    const praise = theme({
      type: "praise",
      sentiment: 0.7,
      mentionCount: 15,
      quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 5, text: "The cloud sync across devices is flawless.", date: null }],
    });
    const sync = compute(APPS, [praise]).features.find((f) => f.feature === "Cross-device sync");
    expect(sync?.tableStakes).toBe(true);
    expect(sync?.quality).toBe("high");
    expect(sync?.gap).toBe(false);
  });

  it("leaves quality unknown when linked mentions are below the floor", () => {
    const sparse = theme({ mentionCount: 2, quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 2, text: "wish it had offline mode", date: null }] });
    const gap = compute(APPS, [sparse]).features.find((f) => f.feature === "Offline mode");
    expect(gap?.quality).toBe("unknown");
  });

  it("respects minDemand and the include* toggles", () => {
    const themes = [theme({ freq: 0.03, mentionCount: 4 })]; // low demand
    // minDemand=high drops the low-demand offline feature
    expect(compute(APPS, themes, { minDemand: "high" }).features.find((f) => f.feature === "Offline mode")).toBeUndefined();
    // includeReviewSignals=false → no demand signal at all
    const noReviews = compute(APPS, themes, { includeReviewSignals: false });
    expect(noReviews.features.every((f) => f.demand === "unknown")).toBe(true);
    // includeDescriptionSignals=false → coverage collapses to 0
    const noDesc = compute(APPS, themes, { includeDescriptionSignals: false });
    expect(noDesc.features.every((f) => f.coverage === 0)).toBe(true);
  });

  it("drops features the market never touches", () => {
    const feats = compute(APPS, []).features.map((f) => f.feature);
    // 'Calendar integration' appears in no description and no theme → not a candidate
    expect(feats).not.toContain("Calendar integration");
  });
});

describe("buildFeatureGapsResponse", () => {
  it("wraps into an ok envelope and partitions gaps/tableStakes", () => {
    const res = findFeatureGaps({ apps: APPS, themes: [theme({ freq: 0.3, mentionCount: 20 })], params: { query: "sleep tracking" } }, 60, "2026-07-06T00:00:00.000Z");
    expect(res.responseType).toBe("feature_gaps");
    expect(res.status).toBe("ok");
    expect(res.data.gaps.every((f) => f.gap)).toBe(true);
    expect(res.data.tableStakes.every((f) => f.tableStakes)).toBe(true);
    expect(res.evidence.length).toBeGreaterThan(0);
    expect(res.caveats.some((c) => c.kind === "weak_evidence")).toBe(true);
  });

  it("degrades to insufficient when nothing matches", () => {
    const res = findFeatureGaps({ apps: [app("apple:9", "Blank", null)], themes: [], params: {} }, 0, "2026-07-06T00:00:00.000Z");
    expect(res.status).toBe("insufficient");
    expect(res.data.features).toHaveLength(0);
    expect(res.confidence.score).toBe(0);
  });

  it("flags the missing review source when no reviews were analysed", () => {
    const { features, coverage } = compute(APPS, []);
    const res = buildFeatureGapsResponse({
      features,
      coverage,
      reviewsAnalyzed: 0,
      apps: APPS,
      params: {},
      enrichment: "llm",
      generatedAt: "2026-07-06T00:00:00.000Z",
      modelVersion: "gemini-2.5-flash",
    });
    expect(res.caveats.some((c) => c.kind === "partial_source" && c.sourceType === "review")).toBe(true);
    expect(res.metadata.modelVersion).toBe("gemini-2.5-flash");
  });
});

describe("FEATURE_GAP_DEFAULTS", () => {
  it("exposes stable thresholds", () => {
    expect(FEATURE_GAP_DEFAULTS.gapCoverageCeiling).toBe(0.3);
    expect(FEATURE_GAP_DEFAULTS.tableStakesCoverageFloor).toBe(0.7);
  });
});

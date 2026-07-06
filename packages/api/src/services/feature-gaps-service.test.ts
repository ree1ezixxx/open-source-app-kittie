import { describe, expect, it, vi } from "vitest";
import type { AppListItem, FeatureGap, FindSimilarAppsResult, ReviewTheme, SimilarApp } from "@kittie/types";
import type { FeatureInputApp } from "@kittie/intelligence";
import {
  getFeatureGaps,
  FeatureGapsError,
  type FeatureGapsDeps,
  type FeatureGapsEnrichment,
} from "./feature-gaps-service.js";

const now = () => new Date("2026-07-06T00:00:00.000Z");

function appItem(overrides: Partial<AppListItem> = {}): AppListItem {
  return {
    id: "apple:1",
    store: "apple",
    storeAppId: "1",
    title: "SleepWell",
    iconUrl: null,
    developer: "Dev",
    category: "Health & Fitness",
    rating: 4.2,
    reviewCount: 5000,
    reviewGrowth7d: null,
    downloadsEstimate30d: null,
    revenueEstimate30d: null,
    growthScore: 60,
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

function similarResult(items: AppListItem[]): FindSimilarAppsResult {
  return {
    interpretedQuery: { summary: "sleep", categories: ["Health & Fitness"], keywords: ["sleep"], kind: "inferred" },
    similar: items.map<SimilarApp>((app) => ({ app, similarityScore: 0.8, similarityClass: "direct", similarityReasons: ["m"], matchedVia: ["fts_keyword"] })),
    confidence: { score: 0.7, reasons: ["hits"] },
    missing: [],
    agentSummary: "sleep apps",
  };
}

function inputApps(): FeatureInputApp[] {
  return [
    { id: "apple:1", name: "SleepWell", description: "Sleep tracking with cloud sync across devices and dark mode.", category: "Health & Fitness" },
    { id: "apple:2", name: "Pillow", description: "Sleep tracking with iCloud sync and Apple Watch support.", category: "Health & Fitness" },
  ];
}

function offlineRequestTheme(): ReviewTheme {
  return {
    theme: "Feature Functionality",
    type: "request",
    freq: 0.3,
    mentionCount: 20,
    sentiment: -0.6,
    apps: ["SleepWell"],
    appBreakdown: [{ appId: "apple:1", appName: "SleepWell", mentionCount: 20, avgRating: 2, sentiment: -0.6 }],
    quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 2, text: "Please add offline mode, useless with no internet.", date: null }],
    trend: "rising",
    confidence: 0.8,
  };
}

/** A praise theme so a well-covered feature (sync) has the quality signal table-stakes needs. */
function syncPraiseTheme(): ReviewTheme {
  return {
    theme: "Cross-Platform Sync",
    type: "praise",
    freq: 0.18,
    mentionCount: 15,
    sentiment: 0.7,
    apps: ["SleepWell", "Pillow"],
    appBreakdown: [{ appId: "apple:1", appName: "SleepWell", mentionCount: 15, avgRating: 5, sentiment: 0.7 }],
    quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 5, text: "Cloud sync across devices is flawless.", date: null }],
    trend: "stable",
    confidence: 0.8,
  };
}

function deps(over: Partial<FeatureGapsDeps> = {}): FeatureGapsDeps {
  return {
    findSimilarApps: vi.fn(async () => similarResult([appItem(), appItem({ id: "apple:2", title: "Pillow" })])),
    resolveApps: vi.fn(async () => inputApps()),
    fetchReviewThemes: vi.fn(async () => ({ themes: [offlineRequestTheme(), syncPraiseTheme()], reviewsAnalyzed: 40 })),
    enrich: vi.fn(async () => null),
    now,
    ...over,
  };
}

describe("getFeatureGaps", () => {
  it("rejects a request with neither query nor appIds", async () => {
    await expect(getFeatureGaps({}, deps())).rejects.toBeInstanceOf(FeatureGapsError);
  });

  it("resolves from a query and returns a feature_gaps matrix with a real gap", async () => {
    const d = deps();
    const res = await getFeatureGaps({ query: "sleep tracking" }, d);
    expect(d.findSimilarApps).toHaveBeenCalledOnce();
    expect(res.responseType).toBe("feature_gaps");
    expect(res.data.gaps.some((f) => f.feature === "Offline mode")).toBe(true);
    expect(res.data.tableStakes.some((f) => f.feature === "Cross-device sync")).toBe(true);
    expect(res.data.reviewsAnalyzed).toBe(40);
  });

  it("uses explicit appIds without discovery, 404s when none resolve", async () => {
    const d = deps();
    await getFeatureGaps({ appIds: ["apple:1", "apple:2"] }, d);
    expect(d.findSimilarApps).not.toHaveBeenCalled();

    const empty = deps({ resolveApps: vi.fn(async () => []) });
    await expect(getFeatureGaps({ appIds: ["apple:x"] }, empty)).rejects.toMatchObject({ status: 404 });
  });

  it("applies LLM name-sharpening without touching the counts", async () => {
    const enrich = vi.fn(
      async (_apps: FeatureInputApp[], features: FeatureGap[]): Promise<FeatureGapsEnrichment> => ({
        names: new Map([[features.findIndex((f) => f.feature === "Offline mode"), "Offline sleep tracking"]]),
        modelVersion: "gemini-2.5-flash",
      }),
    );
    const res = await getFeatureGaps({ query: "sleep" }, deps({ enrich }));
    expect(res.data.enrichment).toBe("llm");
    expect(res.metadata.modelVersion).toBe("gemini-2.5-flash");
    expect(res.data.features.some((f) => f.feature === "Offline sleep tracking")).toBe(true);
  });

  it("degrades to listing-only coverage when the review path is empty", async () => {
    const res = await getFeatureGaps({ query: "sleep" }, deps({ fetchReviewThemes: vi.fn(async () => ({ themes: [], reviewsAnalyzed: 0 })) }));
    expect(res.data.reviewsAnalyzed).toBe(0);
    expect(res.caveats.some((c) => c.kind === "partial_source" && c.sourceType === "review")).toBe(true);
    // coverage-only features still surface (sync appears in both listings)
    expect(res.data.features.some((f) => f.feature === "Cross-device sync")).toBe(true);
  });

  it("skips the review fetch entirely when includeReviewSignals is false", async () => {
    const d = deps();
    const res = await getFeatureGaps({ query: "sleep", includeReviewSignals: false }, d);
    expect(d.fetchReviewThemes).not.toHaveBeenCalled();
    expect(res.data.features.every((f) => f.demand === "unknown")).toBe(true);
  });

  it("clamps limitApps to the max and forwards it to discovery", async () => {
    const d = deps();
    await getFeatureGaps({ query: "sleep", limitApps: 999 }, d);
    expect(d.findSimilarApps).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });
});

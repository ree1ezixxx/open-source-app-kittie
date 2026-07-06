import { describe, expect, it, vi } from "vitest";
import type { AppListItem, FeatureGap, FindSimilarAppsResult, ReviewTheme, SimilarApp } from "@kittie/types";
import {
  getWhitespaceIdeas,
  WhitespaceIdeasError,
  type WhitespaceDeps,
  type WhitespacePhrasing,
} from "./whitespace-service.js";

const now = () => new Date("2026-07-06T00:00:00.000Z");

function app(overrides: Partial<AppListItem> = {}): AppListItem {
  return {
    id: "apple:1",
    store: "apple",
    storeAppId: "1",
    title: "SleepWell",
    iconUrl: null,
    developer: "Dev",
    category: "Health & Fitness",
    rating: 3.4,
    reviewCount: 900,
    reviewGrowth7d: null,
    downloadsEstimate30d: null,
    revenueEstimate30d: 30_000,
    growthScore: 65,
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

function similarResult(apps: AppListItem[]): FindSimilarAppsResult {
  return {
    interpretedQuery: { summary: "s", categories: [], keywords: [], kind: "inferred" },
    similar: apps.map<SimilarApp>((a) => ({ app: a, similarityScore: 0.8, similarityClass: "direct", similarityReasons: ["m"], matchedVia: ["fts_keyword"] })),
    confidence: { score: 0.7, reasons: ["hits"] },
    missing: [],
    agentSummary: "s",
  };
}

function painTheme(): ReviewTheme {
  return {
    theme: "inaccurate tracking",
    type: "complaint",
    freq: 0.3,
    mentionCount: 20,
    sentiment: -0.7,
    apps: ["SleepWell"],
    appBreakdown: [],
    quotes: [{ appId: "apple:1", appName: "SleepWell", rating: 2, text: "Wildly inaccurate.", date: null }],
    trend: "rising",
    confidence: 0.8,
  };
}

function gapFeature(): FeatureGap {
  return {
    feature: "Offline mode",
    coverage: 0.1,
    competitorCount: 1,
    quality: "low",
    demand: "high",
    gap: true,
    gapReason: "Strong gap.",
    tableStakes: false,
    confidence: 0.7,
    evidence: [],
  };
}

function deps(over: Partial<WhitespaceDeps> = {}): WhitespaceDeps {
  return {
    relatedKeywords: vi.fn(async () => ["menopause sleep", "sleep for shift workers", "baby sleep tracker"]),
    findSimilarApps: vi.fn(async (input) =>
      similarResult([app({ id: `apple:${input.query?.length ?? 0}` }), app({ id: "apple:2", title: "Pillow" })]),
    ),
    fetchThemes: vi.fn(async () => ({ themes: [painTheme()], reviewsAnalyzed: 50 })),
    fetchFeatures: vi.fn(async () => [gapFeature()]),
    phrase: vi.fn(async () => null),
    now,
    ...over,
  };
}

describe("getWhitespaceIdeas", () => {
  it("rejects a missing category", async () => {
    await expect(getWhitespaceIdeas({ category: " " }, deps())).rejects.toBeInstanceOf(WhitespaceIdeasError);
  });

  it("generates ideas through the funnel and reports honest counts", async () => {
    const d = deps();
    const res = await getWhitespaceIdeas({ category: "sleep", limit: 2 }, d);
    expect(res.responseType).toBe("whitespace_ideas");
    expect(res.status).toBe("ok");
    // 3 keyword candidates → all prefiltered → capped at limit for deep analysis
    expect(res.data.funnel).toEqual({ candidates: 3, prefiltered: 3, deepAnalyzed: 2 });
    expect(res.data.ideas).toHaveLength(2);
    // ranked best-first with full breakdowns
    expect(res.data.ideas[0]!.score).toBeGreaterThanOrEqual(res.data.ideas[1]!.score);
    expect(Object.keys(res.data.ideas[0]!.scoreBreakdown).sort()).toEqual([
      "demandVelocity",
      "featureGap",
      "incumbentWeakness",
      "monetization",
      "sentimentGap",
    ]);
    // deep services called only for survivors (2), not all candidates (3)
    expect(d.fetchThemes).toHaveBeenCalledTimes(2);
    expect(d.fetchFeatures).toHaveBeenCalledTimes(2);
  });

  it("merges seedIdeas ahead of keywords and dedupes", async () => {
    const d = deps();
    await getWhitespaceIdeas({ category: "sleep", seedIdeas: ["Menopause Sleep", "lucid dreaming"], limit: 5 }, d);
    // "menopause sleep" seed dedupes the identical keyword candidate → 4 total
    const calls = (d.findSimilarApps as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].query);
    expect(calls).toContain("menopause sleep");
    expect(calls).toContain("lucid dreaming");
    expect(calls.filter((q: string) => q === "menopause sleep")).toHaveLength(1);
  });

  it("drops zero-competitor candidates but keeps them in the funnel count", async () => {
    const d = deps({
      findSimilarApps: vi.fn(async (input) =>
        input.query === "menopause sleep" ? similarResult([]) : similarResult([app()]),
      ),
    });
    const res = await getWhitespaceIdeas({ category: "sleep", limit: 5 }, d);
    expect(res.data.funnel.candidates).toBe(3);
    expect(res.data.funnel.prefiltered).toBe(2);
  });

  it("falls back to the category itself when no candidates surface", async () => {
    const d = deps({ relatedKeywords: vi.fn(async () => []) });
    const res = await getWhitespaceIdeas({ category: "sleep" }, d);
    expect(res.data.funnel.candidates).toBe(1);
    expect(res.data.ideas[0]!.niche).toBe("sleep");
  });

  it("applies LLM phrasing without touching scores", async () => {
    const phrase = vi.fn(
      async (): Promise<WhitespacePhrasing> => ({
        map: new Map([[0, { niche: "Menopause sleep coach", angle: "Own the underserved menopause niche." }]]),
        modelVersion: "gemini-2.5-flash",
      }),
    );
    const plain = await getWhitespaceIdeas({ category: "sleep", limit: 1 }, deps());
    const res = await getWhitespaceIdeas({ category: "sleep", limit: 1 }, deps({ phrase }));
    expect(res.data.enrichment).toBe("llm");
    expect(res.data.ideas[0]!.niche).toBe("Menopause sleep coach");
    expect(res.data.ideas[0]!.score).toBe(plain.data.ideas[0]!.score); // numbers untouched
  });

  it("filters by minConfidence and degrades honestly when everything drops", async () => {
    const res = await getWhitespaceIdeas({ category: "sleep", minConfidence: 0.99 }, deps());
    expect(res.data.ideas).toHaveLength(0);
    expect(res.status).toBe("insufficient");
  });

  it("clamps limit to the max deep-analysis budget", async () => {
    const many = Array.from({ length: 24 }, (_, i) => `niche ${i}`);
    const d = deps({ relatedKeywords: vi.fn(async () => many) });
    const res = await getWhitespaceIdeas({ category: "sleep", limit: 999 }, d);
    expect(res.data.funnel.deepAnalyzed).toBe(10); // maxLimit
  });
});

describe("sourceCoverage aggregation (#271 cold-verify)", () => {
  it("dedups overlapping niche competitor sets — appsWithReviews never exceeds appsResolved, partial not masked", async () => {
    // Two candidates whose sets overlap on apple:A. A has reviews everywhere; B never does.
    const d = deps({
      relatedKeywords: vi.fn(async () => ["niche one", "niche two"]),
      findSimilarApps: vi.fn(async (input) =>
        input.query === "niche one"
          ? similarResult([app({ id: "apple:A" })])
          : similarResult([app({ id: "apple:A" }), app({ id: "apple:B", title: "NoReviews" })]),
      ),
      fetchThemes: vi.fn(async (appIds: string[]) => ({
        themes: [painTheme()],
        reviewsAnalyzed: appIds.length === 1 ? 100 : 100, // A capped at 100 in both niches
        perAppReviews: appIds.map((id) => ({ appId: id, reviewsAnalyzed: id === "apple:A" ? 100 : 0 })),
        reviewDateRange: { oldest: "2026-06-01T00:00:00.000Z", newest: "2026-07-01T00:00:00.000Z" },
        localesSeen: ["US"],
      })),
    });
    const res = await getWhitespaceIdeas({ category: "sleep", limit: 2 }, d);
    const sc = res.data.sourceCoverage;
    expect(sc.appsResolved).toBe(2); // A + B deduped
    expect(sc.appsWithReviews).toBe(1); // ONLY A — was 2 under summed aggregation
    expect(sc.appsWithReviews).toBeLessThanOrEqual(sc.appsResolved);
    expect(sc.reviewsAnalyzed).toBe(100); // A's capped rows counted once, not twice
    expect(sc.notes[0]).toEqual({ sourceType: "review", status: "partial" }); // B's silence not masked
  });
});

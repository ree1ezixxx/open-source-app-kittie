import { describe, expect, it, vi } from "vitest";
import type { AppListItem, FindSimilarAppsResult, SimilarApp } from "@kittie/types";
import type { ClusterReviewRow } from "@kittie/db";
import type { ClusterInputApp } from "@kittie/intelligence";
import {
  getReviewClusters,
  ReviewClustersError,
  type ReviewClustersDeps,
  type ReviewClustersEnrichment,
} from "./review-clusters-service.js";

const now = () => new Date("2026-07-06T00:00:00.000Z");
const daysAgo = (d: number) => new Date(now().getTime() - d * 86_400_000).toISOString();

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

function similar(app: AppListItem): SimilarApp {
  return { app, similarityScore: 0.8, similarityClass: "direct", similarityReasons: ["match"], matchedVia: ["fts_keyword"] };
}

function similarResult(apps: AppListItem[]): FindSimilarAppsResult {
  return {
    interpretedQuery: { summary: "sleep tracking", categories: ["Health & Fitness"], keywords: ["sleep"], kind: "inferred" },
    similar: apps.map(similar),
    confidence: { score: 0.7, reasons: ["hits"] },
    missing: [],
    agentSummary: "sleep apps",
  };
}

function reviewRow(overrides: Partial<ClusterReviewRow> = {}): ClusterReviewRow {
  return {
    appId: "apple:1",
    country: "US",
    rating: 2,
    title: null,
    body: "Sleep staging is wildly inaccurate, says deep sleep when I was awake.",
    sentiment: "negative",
    topics: ["App Performance"],
    improvementAreas: ["App Performance"],
    reviewedAt: daysAgo(5),
    ...overrides,
  };
}

/** Deps that never touch the DB or the network — deterministic path by default. */
function deps(over: Partial<ReviewClustersDeps> = {}): ReviewClustersDeps {
  return {
    findSimilarApps: vi.fn(async () => similarResult([appItem(), appItem({ id: "apple:2", title: "Pillow" })])),
    reviewCounts: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 5]))),
    recallReviewed: vi.fn(async () => []),
    resolveApps: vi.fn(async (ids: string[]) => ids.map<ClusterInputApp>((id) => ({ id, name: `App ${id}` }))),
    fetchReviews: vi.fn(async () => Array.from({ length: 8 }, (_, i) => reviewRow({ appId: i % 2 ? "apple:2" : "apple:1" }))),
    enrich: vi.fn(async () => null),
    now,
    ...over,
  };
}

describe("getReviewClusters", () => {
  it("rejects a request with neither query nor appIds", async () => {
    await expect(getReviewClusters({}, deps())).rejects.toBeInstanceOf(ReviewClustersError);
  });

  it("resolves competitors from a query and returns a deterministic envelope", async () => {
    const d = deps();
    const res = await getReviewClusters({ query: "sleep tracking" }, d);
    expect(d.findSimilarApps).toHaveBeenCalledOnce();
    expect(res.responseType).toBe("review_clusters");
    expect(res.status).toBe("ok");
    expect(res.data.enrichment).toBe("deterministic");
    expect(res.data.themes[0]?.mentionCount).toBe(8);
  });

  it("uses explicit appIds without discovery, and 404s when none resolve", async () => {
    const d = deps();
    const res = await getReviewClusters({ appIds: ["apple:1", "apple:2"] }, d);
    expect(d.findSimilarApps).not.toHaveBeenCalled();
    expect(res.data.appIds).toEqual(["apple:1", "apple:2"]);

    const empty = deps({ resolveApps: vi.fn(async () => []) });
    await expect(getReviewClusters({ appIds: ["apple:x"] }, empty)).rejects.toMatchObject({ status: 404 });
  });

  it("applies LLM relabels over the deterministic counts without changing them", async () => {
    const enrich = vi.fn(
      async (): Promise<ReviewClustersEnrichment> => ({
        map: new Map([[0, { name: "inaccurate sleep staging", type: "bug" }]]),
        modelVersion: "gemini-2.5-flash",
      }),
    );
    const res = await getReviewClusters({ query: "sleep" }, deps({ enrich }));
    expect(res.data.enrichment).toBe("llm");
    expect(res.metadata.modelVersion).toBe("gemini-2.5-flash");
    expect(res.data.themes[0]?.theme).toBe("inaccurate sleep staging");
    // Count is untouched by enrichment.
    expect(res.data.themes[0]?.mentionCount).toBe(8);
  });

  it("degrades to insufficient when the competitor set has no reviews", async () => {
    const res = await getReviewClusters({ query: "sleep" }, deps({ fetchReviews: vi.fn(async () => []) }));
    expect(res.status).toBe("insufficient");
    expect(res.caveats.some((c) => c.kind === "missing_source")).toBe(true);
  });

  it("clamps limitApps to the max and forwards it to discovery", async () => {
    const d = deps();
    await getReviewClusters({ query: "sleep", limitApps: 999 }, d);
    expect(d.findSimilarApps).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 })); // 25 clamped × 4 over-fetch, capped at 50 (#268)
  });
});

describe("query-mode review preference (#268 partial)", () => {
  it("prefers review-bearing competitors, keeps relevance order within groups, never filters", async () => {
    const ranked = [
      appItem({ id: "apple:no1", title: "NoRev1" }),
      appItem({ id: "apple:yes1", title: "HasRev1" }),
      appItem({ id: "apple:no2", title: "NoRev2" }),
      appItem({ id: "apple:yes2", title: "HasRev2" }),
    ];
    const d = deps({
      findSimilarApps: vi.fn(async () => similarResult(ranked)),
      reviewCounts: vi.fn(async () => ({ "apple:yes1": 10, "apple:yes2": 3, "apple:no1": 0, "apple:no2": 0 })),
    });
    const res = await getReviewClusters({ query: "sleep", limitApps: 3 }, d);
    // review-bearing first (relevance order kept), review-less fill the remainder
    expect(res.data.appIds).toEqual(["apple:yes1", "apple:yes2", "apple:no1"]);
    // over-fetch: limit passed to discovery is 4x the requested set
    expect(d.findSimilarApps).toHaveBeenCalledWith(expect.objectContaining({ limit: 12 }));
  });
});

describe("evidence-recall merge (#268 round 2)", () => {
  it("recalled review-bearing incumbents lead the set even when discovery misses them", async () => {
    const d = deps({
      findSimilarApps: vi.fn(async () => similarResult([appItem({ id: "apple:norev", title: "Budgeting App - Spend Tracker" })])),
      reviewCounts: vi.fn(async () => ({ "apple:norev": 0, "apple:ynab": 250 })),
      recallReviewed: vi.fn(async () => [{ id: "apple:ynab", name: "YNAB", matched: ["budgeting"] }]),
      fetchReviews: vi.fn(async () => Array.from({ length: 6 }, () => reviewRow({ appId: "apple:ynab" }))),
    });
    const res = await getReviewClusters({ query: "budgeting" }, d);
    expect(res.data.appIds[0]).toBe("apple:ynab");
    expect(res.status).toBe("ok"); // evidence found despite discovery miss
    expect(d.recallReviewed).toHaveBeenCalledWith("budgeting", 10);
  });
});

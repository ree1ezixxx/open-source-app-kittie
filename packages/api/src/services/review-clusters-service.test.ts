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
    expect(d.findSimilarApps).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });
});

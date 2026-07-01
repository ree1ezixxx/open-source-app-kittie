import { describe, expect, it } from "vitest";
import type { AppDetail, AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";
import {
  AppDetailIntelligenceError,
  buildAppDetailIntelligence,
  getAppDetailIntelligence,
} from "./app-detail-intelligence-service.js";

const now = new Date("2026-07-01T12:00:00.000Z");

function app(overrides: Partial<AppDetail> = {}): AppDetail {
  return {
    id: "app_1",
    store: "apple",
    storeAppId: "123456789",
    title: "Focus Timer",
    iconUrl: "https://example.com/icon.png",
    developer: "Example Studio",
    category: "Productivity",
    rating: 4.8,
    reviewCount: 18420,
    reviewGrowth7d: 120,
    downloadsEstimate30d: 41000,
    revenueEstimate30d: 76000,
    growthScore: 78,
    growthPct: 0.12,
    downloadsEstimatePrior: 38000,
    revenueEstimatePrior: 70000,
    rankDelta: 4,
    isFirstMover: true,
    releasedAt: "2025-01-10T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    description: "A timer app.",
    screenshotUrls: ["https://example.com/1.png", "https://example.com/2.png"],
    websiteUrl: "https://example.com",
    supportEmail: null,
    price: 0,
    contentRating: "4+",
    languages: ["EN"],
    fileSizeBytes: null,
    minOsVersion: null,
    sellerName: null,
    iaps: [{ name: "Pro", price: 4.99, currency: "USD" }],
    metaAds: [],
    appleSearchAds: [],
    creators: [],
    historicals: [
      {
        date: "2026-06-30",
        reviewCount: 18420,
        rating: 4.8,
        chartRank: 12,
        downloadsEstimate: 41000,
        revenueEstimate: 76000,
      },
    ],
    ...overrides,
  };
}

function deps(appById: AppDetail | null, searchData: AppListItem[] = []) {
  return {
    getAppByAnyId: async () => appById,
    searchApps: async (_params: AppSearchParams): Promise<PaginatedResponse<AppListItem>> => ({
      data: searchData,
      pagination: { nextCursor: null, totalCount: searchData.length },
    }),
    now: () => now,
  };
}

describe("app detail intelligence", () => {
  it("returns a valid grounded intelligence envelope for a seeded app", async () => {
    const result = await getAppDetailIntelligence({ appId: "app_1" }, deps(app()));

    expect(result.responseType).toBe("app_detail");
    expect(result.status).toBe("ok");
    expect(result.data.app.title).toBe("Focus Timer");
    expect(result.data.observed.reviewCount).toBe(18420);
    expect(result.data.estimated.revenue30dUsd).toBe(76000);
    expect(result.metadata.snapshotId).toBe("snapshot:app_1:US:2026-06-30");
    expect(result.evidence.map((e) => e.id)).toEqual(
      expect.arrayContaining(["app_identity", "store_reviews", "store_rating", "revenue_estimate"]),
    );
  });

  it("cites a Store URL for Google observed evidence too", () => {
    const result = buildAppDetailIntelligence(
      app({ store: "google", storeAppId: "com.example.timer" }),
      { appId: "google:com.example.timer" },
      now,
    );

    expect(result.evidence.find((e) => e.id === "app_identity")?.source.url).toBe(
      "https://play.google.com/store/apps/details?id=com.example.timer",
    );
  });

  it("returns a clear missing-app error", async () => {
    await expect(getAppDetailIntelligence({ appId: "missing" }, deps(null))).rejects.toMatchObject({
      status: 404,
      message: "App not found for appId: missing",
    });
  });

  it("returns a clear ambiguous-query error with candidates", async () => {
    const candidate = app();
    await expect(
      getAppDetailIntelligence({ query: "timer" }, deps(candidate, [candidate, { ...candidate, id: "app_2" }])),
    ).rejects.toMatchObject({
      status: 409,
      message: "App query is ambiguous; provide a specific appId.",
    });
  });

  it("lowers confidence when listing media is missing and the Snapshot is stale", () => {
    const result = buildAppDetailIntelligence(
      app({ screenshotUrls: [], historicals: [{ ...app().historicals[0]!, date: "2026-05-01" }] }),
      { appId: "app_1" },
      now,
    );

    expect(result.status).toBe("partial");
    expect(result.confidence.score).toBeLessThan(0.6);
    expect(result.caveats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing_source", message: expect.stringContaining("Listing media is missing") }),
        expect.objectContaining({ kind: "stale_source", message: expect.stringContaining("Snapshot is stale") }),
      ]),
    );
    expect(result.evidence.some((e) => e.id === "listing_media")).toBe(false);
  });

  it("rejects requests without exactly one resolver input", async () => {
    await expect(getAppDetailIntelligence({}, deps(app()))).rejects.toBeInstanceOf(AppDetailIntelligenceError);
    await expect(getAppDetailIntelligence({ appId: "app_1", query: "Focus" }, deps(app()))).rejects.toMatchObject({
      status: 400,
    });
  });
});

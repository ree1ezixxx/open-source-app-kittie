import { describe, expect, it } from "vitest";
import type { AppDetail, AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";
import {
  CompareAppsIntelligenceError,
  getCompareAppsIntelligence,
} from "./compare-apps-intelligence-service.js";

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

function deps(apps: AppDetail[], searchData: AppListItem[] = []) {
  return {
    getAppByAnyId: async (id: string) => apps.find((candidate) => candidate.id === id || candidate.storeAppId === id) ?? null,
    searchApps: async (_params: AppSearchParams): Promise<PaginatedResponse<AppListItem>> => ({
      data: searchData,
      pagination: { nextCursor: null, totalCount: searchData.length },
    }),
    now: () => now,
  };
}

describe("compare apps intelligence service", () => {
  it("resolves two app ids and returns compare_apps data", async () => {
    const result = await getCompareAppsIntelligence(
      {
        apps: [
          { appId: "app_1" },
          { appId: "app_2" },
        ],
      },
      deps([app(), app({ id: "app_2", title: "Deep Work", storeAppId: "2", reviewCount: 9000 })]),
    );

    expect(result.responseType).toBe("compare_apps");
    expect(result.data.rows.map((row) => row.title)).toEqual(["Focus Timer", "Deep Work"]);
  });

  it("resolves more than two Apps", async () => {
    const result = await getCompareAppsIntelligence(
      {
        apps: [{ appId: "app_1" }, { appId: "app_2" }, { appId: "app_3" }],
      },
      deps([
        app(),
        app({ id: "app_2", title: "Deep Work", storeAppId: "2" }),
        app({ id: "app_3", title: "Pomodoro Lab", storeAppId: "3" }),
      ]),
    );

    expect(result.data.rows).toHaveLength(3);
    expect(result.confidence.reasons).toContain("3 Apps compared");
  });

  it("returns a clear unknown App error", async () => {
    await expect(
      getCompareAppsIntelligence({ apps: [{ appId: "app_1" }, { appId: "missing" }] }, deps([app()])),
    ).rejects.toMatchObject({
      status: 404,
      message: "App not found for apps[1].appId: missing",
    });
  });

  it("resolves exact query matches through search", async () => {
    const focus = app();
    const deepWork = app({ id: "app_2", title: "Deep Work", storeAppId: "2" });
    const result = await getCompareAppsIntelligence(
      { apps: [{ appId: "app_1" }, { query: "Deep Work", store: "apple" }] },
      deps([focus, deepWork], [deepWork]),
    );

    expect(result.data.rows.map((row) => row.title)).toEqual(["Focus Timer", "Deep Work"]);
  });

  it("rejects ambiguous or underspecified app refs", async () => {
    await expect(getCompareAppsIntelligence({ apps: [{ appId: "app_1" }] }, deps([app()]))).rejects.toBeInstanceOf(
      CompareAppsIntelligenceError,
    );
    await expect(
      getCompareAppsIntelligence({ apps: [{ appId: "app_1" }, { appId: "app_2", query: "Deep" }] }, deps([app()])),
    ).rejects.toMatchObject({ status: 400 });
  });
});

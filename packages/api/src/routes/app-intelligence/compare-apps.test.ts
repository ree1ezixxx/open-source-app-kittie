import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompareAppsResponse } from "@kittie/intelligence";
import type { AppDetail } from "@kittie/types";

const mocks = vi.hoisted(() => ({
  getCompareAppsIntelligence: vi.fn(),
}));

vi.mock("../../services/compare-apps-intelligence-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/compare-apps-intelligence-service.js")>();
  return {
    ...actual,
    getCompareAppsIntelligence: mocks.getCompareAppsIntelligence,
  };
});

const { compareAppsRouter } = await import("./compare-apps.js");

function app(overrides: Partial<AppDetail> = {}): AppDetail {
  return {
    id: "app_1",
    store: "apple",
    storeAppId: "123",
    title: "Focus",
    iconUrl: null,
    developer: "Dev",
    category: null,
    rating: null,
    reviewCount: 1,
    reviewGrowth7d: null,
    downloadsEstimate30d: null,
    revenueEstimate30d: null,
    growthScore: null,
    growthPct: null,
    downloadsEstimatePrior: null,
    revenueEstimatePrior: null,
    rankDelta: null,
    isFirstMover: false,
    releasedAt: null,
    updatedAt: null,
    description: null,
    screenshotUrls: ["https://example.com/1.png"],
    websiteUrl: null,
    supportEmail: null,
    price: null,
    contentRating: null,
    languages: [],
    fileSizeBytes: null,
    minOsVersion: null,
    sellerName: null,
    iaps: [],
    metaAds: [],
    appleSearchAds: [],
    creators: [],
    historicals: [{ date: "2026-07-01", reviewCount: 1, rating: null, chartRank: null, downloadsEstimate: null, revenueEstimate: null }],
    ...overrides,
  };
}

describe("compare apps intelligence route", () => {
  beforeEach(() => {
    mocks.getCompareAppsIntelligence.mockReset();
  });

  it("exposes POST /compare-apps", async () => {
    mocks.getCompareAppsIntelligence.mockResolvedValue(
      buildCompareAppsResponse({
        apps: [app(), app({ id: "app_2", storeAppId: "2", title: "Deep Work" })],
        generatedAt: "2026-07-01T12:00:00.000Z",
        sourceQuery: { appCount: 2 },
      }),
    );

    const res = await compareAppsRouter.request("/", {
      method: "POST",
      body: JSON.stringify({ apps: [{ appId: "app_1" }, { appId: "app_2" }] }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body as { data: { responseType: string } }).data.responseType).toBe("compare_apps");
    expect(mocks.getCompareAppsIntelligence).toHaveBeenCalledWith({
      apps: [{ appId: "app_1" }, { appId: "app_2" }],
    });
  });
});

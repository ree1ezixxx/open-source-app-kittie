import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAppDetailIntelligence } from "../../services/app-detail-intelligence-service.js";
import { appDetailRouter } from "./app-detail.js";

const mocks = vi.hoisted(() => ({
  getAppDetailIntelligence: vi.fn(),
}));

vi.mock("../../services/app-detail-intelligence-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/app-detail-intelligence-service.js")>();
  return {
    ...actual,
    getAppDetailIntelligence: mocks.getAppDetailIntelligence,
  };
});

describe("app detail intelligence route", () => {
  beforeEach(() => {
    mocks.getAppDetailIntelligence.mockReset();
  });

  it("exposes GET /apps/:id", async () => {
    mocks.getAppDetailIntelligence.mockResolvedValue(
      buildAppDetailIntelligence(
        {
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
        },
        { appId: "app_1" },
        new Date("2026-07-01T12:00:00.000Z"),
      ),
    );

    const res = await appDetailRouter.request("/apps/app_1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body as { data: { responseType: string } }).data.responseType).toBe("app_detail");
    expect(mocks.getAppDetailIntelligence).toHaveBeenCalledWith({ appId: "app_1" });
  });
});

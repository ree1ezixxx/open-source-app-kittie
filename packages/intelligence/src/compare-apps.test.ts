import { describe, expect, it } from "vitest";
import type { AppDetail } from "@kittie/types";
import { buildCompareAppsResponse, CompareAppsError } from "./compare-apps.js";

const generatedAt = "2026-07-01T12:00:00.000Z";

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
    appleSearchAds: [{ country: "US", keyword: "focus timer", rank: 2 }],
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

describe("compare apps intelligence", () => {
  it("returns table-ready dimensions, rows, insights, and per-App evidence for two Apps", () => {
    const result = buildCompareAppsResponse({
      apps: [
        app(),
        app({
          id: "app_2",
          storeAppId: "987654321",
          title: "Deep Work",
          reviewCount: 9000,
          growthScore: 64,
          revenueEstimate30d: 52000,
        }),
      ],
      generatedAt,
      sourceQuery: { appCount: 2 },
    });

    expect(result.responseType).toBe("compare_apps");
    expect(result.data.dimensions.map((dimension) => dimension.key)).toEqual(
      expect.arrayContaining(["reviews", "growth_score", "revenue_30d_usd"]),
    );
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[0]).toMatchObject({
      title: "Focus Timer",
      values: { reviews: 18420, growth_score: 78, revenue_30d_usd: 76000 },
    });
    expect(result.data.rows[0]?.evidenceIds.length).toBeGreaterThan(5);
    expect(result.evidence.filter((entry) => entry.id.includes("app_1")).length).toBeGreaterThan(5);
    expect(result.data.insights.some((insight) => insight.message.includes("Most reviewed"))).toBe(true);
  });

  it("accepts more than two Apps", () => {
    const result = buildCompareAppsResponse({
      apps: [
        app(),
        app({ id: "app_2", title: "Deep Work", storeAppId: "2", reviewCount: 9000 }),
        app({ id: "app_3", title: "Pomodoro Lab", storeAppId: "3", reviewCount: 1200 }),
      ],
      generatedAt,
      sourceQuery: { appCount: 3 },
    });

    expect(result.data.rows.map((row) => row.title)).toEqual(["Focus Timer", "Deep Work", "Pomodoro Lab"]);
    expect(result.confidence.reasons).toContain("3 Apps compared");
  });

  it("turns partial fields into explicit caveats without inventing evidence", () => {
    const result = buildCompareAppsResponse({
      apps: [
        app(),
        app({
          id: "app_2",
          title: "Sparse App",
          storeAppId: "2",
          rating: null,
          growthScore: null,
          growthPct: null,
          downloadsEstimate30d: null,
          revenueEstimate30d: null,
          screenshotUrls: [],
          appleSearchAds: [],
          historicals: [],
        }),
      ],
      generatedAt,
      sourceQuery: { appCount: 2 },
    });

    const sparse = result.data.rows.find((row) => row.title === "Sparse App")!;
    expect(sparse.values.rating).toBeNull();
    expect(sparse.caveats).toEqual(expect.arrayContaining([expect.stringContaining("rating is unavailable")]));
    expect(result.caveats).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("rating is unavailable") })]));
    expect(result.evidence.some((entry) => entry.id === "ev_app_2_rating")).toBe(false);
  });

  it("requires at least two Apps", () => {
    expect(() =>
      buildCompareAppsResponse({
        apps: [app()],
        generatedAt,
        sourceQuery: { appCount: 1 },
      }),
    ).toThrow(CompareAppsError);
  });
});

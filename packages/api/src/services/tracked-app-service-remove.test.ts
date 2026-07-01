import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@kittie/types";

type GeneratedRow = {
  id: string;
  trackedAppId: string;
  appId: string;
  store: Store;
  country: string;
  keyword: string;
  source: string;
  createdAt: Date;
};

let generatedRows: GeneratedRow[] = [];

const deleteKeywordForTrackedApp = vi.fn(async (_db: unknown, trackedAppId: string, country: string, keyword: string) => {
  generatedRows = generatedRows.filter(
    (row) => !(row.trackedAppId === trackedAppId && row.country === country.toUpperCase() && row.keyword === keyword),
  );
});
const getTrackedAppById = vi.fn(async () => ({
  id: "ta_1",
  appId: "app_1",
  storeAppId: "123",
  store: "apple" as const,
  country: "US",
  title: "Test App",
  developer: "Test Dev",
  iconUrl: null,
  category: "Productivity",
  addedAt: new Date("2026-06-20T12:00:00Z"),
  generatedKeywordCount: generatedRows.length,
  lastAnalyzedAt: new Date(),
}));
const listGeneratedKeywordsForTrackedApp = vi.fn(async () => generatedRows);
const listTrackedAppKeywordRankings = vi.fn(async (_db: unknown, _trackedAppId: string, country?: string) => {
  const market = country?.toUpperCase();
  return generatedRows
    .filter((row) => !market || row.source === "ai" || row.country === market)
    .map((row) => ({
      keywordId: `${row.store}:${market ?? row.country}:${row.keyword}`,
      keyword: row.keyword,
      country: market ?? row.country,
      store: row.store,
      position: null,
      growth: null,
      observedAt: null,
      popularity: null,
      difficulty: null,
      trafficScore: null,
      opportunityScore: null,
      competingAppCount: null,
      topApps: [],
    }));
});

vi.mock("../lib/db.js", () => ({ getDb: () => ({}) }));

vi.mock("@kittie/db", () => ({
  addKeywordForTrackedApp: vi.fn(),
  deleteKeywordForTrackedApp,
  filterGeneratedKeywordsForCountry: (rows: GeneratedRow[], country: string) => {
    const market = country.toUpperCase();
    return rows.filter((row) => row.source === "ai" || row.country === market);
  },
  getAppRowById: vi.fn(),
  getGeneratedKeywordInputHash: vi.fn(),
  getTrackedApp: vi.fn(),
  getTrackedAppById,
  insertKeywordRanking: vi.fn(),
  listGeneratedKeywordsForTrackedApp,
  listTrackedAppKeywordRankings,
  listTrackedAppPositionHistory: vi.fn(async () => []),
  listTrackedApps: vi.fn(),
  makeKeywordLookupId: (store: Store, country: string, keyword: string) => `${store}:${country}:${keyword}`,
  markTrackedAppAnalyzed: vi.fn(),
  replaceGeneratedKeywordsForTrackedApp: vi.fn(),
  trackApp: vi.fn(),
  untrackApp: vi.fn(),
}));

const { removeKeywordFromTrackedApp } = await import("./tracked-app-service.js");

describe("removeKeywordFromTrackedApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generatedRows = [
      {
        id: "tak_gb",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "GB",
        keyword: "budget planner",
        source: "custom",
        createdAt: new Date("2026-06-20T12:00:00Z"),
      },
      {
        id: "tak_us",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "US",
        keyword: "budget planner",
        source: "custom",
        createdAt: new Date("2026-06-20T12:01:00Z"),
      },
    ];
  });

  it("deletes the selected market custom keyword and leaves another market intact", async () => {
    const result = await removeKeywordFromTrackedApp("ta_1", "budget planner", "US");

    expect(deleteKeywordForTrackedApp).toHaveBeenCalledWith(expect.anything(), "ta_1", "US", "budget planner");
    expect(generatedRows.map((row) => `${row.country}:${row.keyword}`)).toEqual(["GB:budget planner"]);
    expect(result?.rows.map((row) => `${row.country}:${row.keyword}`)).toEqual([]);
  });

  it("keeps AI keyword deletion global by deleting the stored AI row country", async () => {
    generatedRows = [
      {
        id: "tak_ai",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "US",
        keyword: "habit tracker",
        source: "ai",
        createdAt: new Date("2026-06-20T12:00:00Z"),
      },
    ];

    await removeKeywordFromTrackedApp("ta_1", "habit tracker", "GB");

    expect(deleteKeywordForTrackedApp).toHaveBeenCalledWith(expect.anything(), "ta_1", "US", "habit tracker");
    expect(generatedRows).toEqual([]);
  });
});

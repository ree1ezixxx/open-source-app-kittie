import { describe, expect, it } from "vitest";

import { buildPositionHistorySeries, keywordIdsForGeneratedKeywords, latestRankObservations } from "./tracked-apps.js";

describe("latestRankObservations", () => {
  it("lets a fresh not-ranked observation supersede an older positive rank", () => {
    const latest = latestRankObservations([
      { keywordId: "apple:US:learn spanish", rank: null, observedAt: new Date("2026-06-22T12:00:00Z") },
      { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-21T12:00:00Z") },
    ]);

    expect(latest.get("apple:US:learn spanish")).toEqual({
      rank: null,
      observedAt: new Date("2026-06-22T12:00:00Z"),
    });
  });
});

describe("keywordIdsForGeneratedKeywords", () => {
  it("fans generated keywords into a selected market lookup id", () => {
    const ids = keywordIdsForGeneratedKeywords([
      {
        id: "tak_1",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "US",
        keyword: "learn spanish",
        createdAt: new Date("2026-06-22T12:00:00Z"),
      },
    ], "DE");

    expect(ids).toEqual(["apple:DE:learn spanish"]);
  });
});

describe("buildPositionHistorySeries", () => {
  const generated = [{
    id: "tak_1",
    trackedAppId: "ta_1",
    appId: "app_1",
    store: "apple" as const,
    country: "US",
    keyword: "learn spanish",
    createdAt: new Date("2026-06-20T12:00:00Z"),
  }];

  it("builds per-keyword points with day-over-day deltas", () => {
    const series = buildPositionHistorySeries({
      generated,
      rankingRows: [
        { keywordId: "apple:US:learn spanish", rank: 8, observedAt: new Date("2026-06-20T12:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-21T12:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 7, observedAt: new Date("2026-06-22T12:00:00Z") },
      ],
      country: "US",
    });

    expect(series[0]?.points).toEqual([
      { date: "2026-06-20", position: 8, delta: null },
      { date: "2026-06-21", position: 5, delta: 3 },
      { date: "2026-06-22", position: 7, delta: -2 },
    ]);
  });

  it("keeps one-day data honest with no fabricated delta", () => {
    const series = buildPositionHistorySeries({
      generated,
      rankingRows: [
        { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-22T12:00:00Z") },
      ],
      country: "US",
    });

    expect(series[0]?.points).toEqual([
      { date: "2026-06-22", position: 5, delta: null },
    ]);
  });
});

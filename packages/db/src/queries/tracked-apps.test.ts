import { describe, expect, it } from "vitest";

import { keywordIdsForGeneratedKeywords, latestRankObservations } from "./tracked-apps.js";

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

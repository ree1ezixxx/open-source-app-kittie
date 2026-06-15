import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseRssChartFeed } from "./charts.js";

/**
 * A captured (real) iTunes-RSS response for the US Top-Paid Business chart,
 * trimmed to three entries. Loaded from disk (not imported) so the test never
 * touches the network and the fixture stays out of the tsc build graph.
 */
const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./__fixtures__/rss-toppaid-business.json", import.meta.url)),
    "utf8",
  ),
);

describe("parseRssChartFeed", () => {
  it("parses a captured per-genre RSS feed into ranked ChartRow[]", () => {
    const rows = parseRssChartFeed(fixture, {
      type: "paid",
      genre: "Business",
      country: "us",
    });

    expect(rows).toHaveLength(3);

    expect(rows[0]).toEqual({
      storeAppId: "294934058",
      title: "HotSchedules",
      developer: "HotSchedules",
      iconUrl: expect.stringContaining("100x100bb.png"),
      category: "Business",
      chartCategory: "top-paid:Business",
      chartRank: 1,
      chartCountry: "US",
    });

    // Rank is the feed position (1-based) and the country is upper-cased.
    expect(rows.map((r) => r.chartRank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.storeAppId)).toEqual(["294934058", "364876095", "601159497"]);
    expect(rows.every((r) => r.chartCountry === "US")).toBe(true);
    // Every row carries the codec-encoded chart_category for this (type, genre).
    expect(rows.every((r) => r.chartCategory === "top-paid:Business")).toBe(true);
  });

  it("encodes the overall (no-genre) chart_category as the bare slug", () => {
    const rows = parseRssChartFeed(fixture, { type: "grossing", genre: null, country: "us" });
    expect(rows.every((r) => r.chartCategory === "top-grossing")).toBe(true);
    expect(rows.every((r) => r.category === null)).toBe(true);
  });

  it("tolerates a single-entry feed deserialised as an object (not an array)", () => {
    const first = (fixture as { feed: { entry: unknown[] } }).feed.entry[0];
    const single = { feed: { entry: first } } as Parameters<typeof parseRssChartFeed>[0];
    const rows = parseRssChartFeed(single, { type: "free", genre: null, country: "gb" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chartRank).toBe(1);
    expect(rows[0]?.chartCountry).toBe("GB");
  });

  it("drops entries missing a store id and returns [] for an empty feed", () => {
    const noId = { feed: { entry: [{ "im:name": { label: "x" } }] } };
    expect(parseRssChartFeed(noId, { type: "free", genre: null, country: "us" })).toEqual([]);
    expect(parseRssChartFeed({ feed: {} }, { type: "free", genre: null, country: "us" })).toEqual(
      [],
    );
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleTopCharts,
  normalizeChartType,
  type ChartRow,
} from "../src/queries/charts.ts";

function row(partial: Partial<ChartRow> & { appId: string; snapshotDate: string; chartRank: number }): ChartRow {
  return {
    chartCategory: "top-free",
    rating: 4.5,
    reviewCount: 1000,
    app: {
      id: partial.appId,
      store: "apple",
      storeAppId: `store-${partial.appId}`,
      title: `App ${partial.appId}`,
      developer: "Dev",
      iconUrl: null,
      category: "Productivity",
    },
    ...partial,
  };
}

test("normalizeChartType collapses every historical encoding to a canonical type", () => {
  assert.equal(normalizeChartType("top-free"), "free");
  assert.equal(normalizeChartType("topfreeapplications"), "free");
  assert.equal(normalizeChartType("top-paid"), "paid");
  assert.equal(normalizeChartType("toppaidapplications"), "paid");
  assert.equal(normalizeChartType("top-grossing"), "grossing");
  assert.equal(normalizeChartType("topgrossingapplications"), "grossing");
  assert.equal(normalizeChartType("TOP-FREE"), "free"); // case-insensitive
  assert.equal(normalizeChartType(null), null);
  assert.equal(normalizeChartType("editors-choice"), null);
});

test("paid rows are excluded from a free chart", () => {
  const rows: ChartRow[] = [
    row({ appId: "a", snapshotDate: "2026-06-10", chartRank: 1, chartCategory: "top-free" }),
    row({ appId: "b", snapshotDate: "2026-06-10", chartRank: 2, chartCategory: "top-free" }),
    row({ appId: "c", snapshotDate: "2026-06-10", chartRank: 1, chartCategory: "toppaidapplications" }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "free" });
  assert.deepEqual(result.entries.map((e) => e.app.id), ["a", "b"]);
  assert.equal(result.type, "free");
});

test("resolves the latest date and ranks ascending", () => {
  const rows: ChartRow[] = [
    row({ appId: "old", snapshotDate: "2026-06-07", chartRank: 1 }),
    row({ appId: "b", snapshotDate: "2026-06-10", chartRank: 2 }),
    row({ appId: "a", snapshotDate: "2026-06-10", chartRank: 1 }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "free" });
  assert.equal(result.date, "2026-06-10"); // latest, not the stale 06-07
  assert.deepEqual(result.entries.map((e) => e.app.id), ["a", "b"]);
});

test("24h delta is computed against the most recent prior day (positive = climbed)", () => {
  const rows: ChartRow[] = [
    row({ appId: "climber", snapshotDate: "2026-06-09", chartRank: 10 }),
    row({ appId: "climber", snapshotDate: "2026-06-10", chartRank: 3 }), // 10 -> 3
    row({ appId: "faller", snapshotDate: "2026-06-09", chartRank: 1 }),
    row({ appId: "faller", snapshotDate: "2026-06-10", chartRank: 5 }), // 1 -> 5
    row({ appId: "newcomer", snapshotDate: "2026-06-10", chartRank: 1 }), // no prior
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "free" });
  const byId = Object.fromEntries(result.entries.map((e) => [e.app.id, e.rankDelta]));
  assert.equal(byId["climber"], 7); // 10 - 3
  assert.equal(byId["faller"], -4); // 1 - 5
  assert.equal(byId["newcomer"], null); // first appearance
});

test("prior day is the nearest before target, skipping gaps — not two days back", () => {
  const rows: ChartRow[] = [
    row({ appId: "x", snapshotDate: "2026-06-05", chartRank: 50 }), // older, ignored
    row({ appId: "x", snapshotDate: "2026-06-09", chartRank: 8 }), // nearest prior
    row({ appId: "x", snapshotDate: "2026-06-10", chartRank: 4 }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "free" });
  assert.equal(result.entries[0].rankDelta, 4); // 8 - 4, not 50 - 4
});

test("limit truncates to the top N by rank", () => {
  const rows: ChartRow[] = Array.from({ length: 10 }, (_, i) =>
    row({ appId: `a${i}`, snapshotDate: "2026-06-10", chartRank: i + 1 }),
  );
  const result = assembleTopCharts(rows, { store: "apple", type: "free", limit: 3 });
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.entries.map((e) => e.rank), [1, 2, 3]);
});

test("a clean overall ranking is preferred over a larger per-genre union", () => {
  // Legacy per-genre union (4 rows, ranks repeat across two genres) vs a clean
  // modern overall ranking (3 rows, unique). Uniqueness wins over size, so the
  // clean ranking is used and ranks never duplicate.
  const rows: ChartRow[] = [
    row({ appId: "g1a", snapshotDate: "2026-06-10", chartRank: 1, chartCategory: "topgrossingapplications" }),
    row({ appId: "g1b", snapshotDate: "2026-06-10", chartRank: 1, chartCategory: "topgrossingapplications" }),
    row({ appId: "g2a", snapshotDate: "2026-06-10", chartRank: 2, chartCategory: "topgrossingapplications" }),
    row({ appId: "g2b", snapshotDate: "2026-06-10", chartRank: 2, chartCategory: "topgrossingapplications" }),
    row({ appId: "modern1", snapshotDate: "2026-06-10", chartRank: 1, chartCategory: "top-grossing" }),
    row({ appId: "modern2", snapshotDate: "2026-06-10", chartRank: 2, chartCategory: "top-grossing" }),
    row({ appId: "modern3", snapshotDate: "2026-06-10", chartRank: 3, chartCategory: "top-grossing" }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "grossing" });
  assert.deepEqual(result.entries.map((e) => e.app.id), ["modern1", "modern2", "modern3"]);
  const ranks = result.entries.map((e) => e.rank);
  assert.equal(new Set(ranks).size, ranks.length, "ranks must be unique");
});

test("overall request with only a per-genre union and no clean source renders empty (honest)", () => {
  // Mirrors the real DB: overall grossing has only the legacy per-genre union,
  // no clean modern ranking. We refuse to fabricate an overall chart.
  const rows: ChartRow[] = [
    row({ appId: "a", snapshotDate: "2026-06-08", chartRank: 1, chartCategory: "topgrossingapplications" }),
    row({ appId: "b", snapshotDate: "2026-06-08", chartRank: 1, chartCategory: "topgrossingapplications" }),
    row({ appId: "c", snapshotDate: "2026-06-08", chartRank: 2, chartCategory: "topgrossingapplications" }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "grossing" });
  assert.equal(result.date, null);
  assert.deepEqual(result.entries, []);
});

test("a pinned date with only an unclean union collapses to unique ranks (highest reviews per rank)", () => {
  const rows: ChartRow[] = [
    row({ appId: "lo", snapshotDate: "2026-06-08", chartRank: 1, chartCategory: "topgrossingapplications", reviewCount: 10 }),
    row({ appId: "hi", snapshotDate: "2026-06-08", chartRank: 1, chartCategory: "topgrossingapplications", reviewCount: 999 }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "grossing", date: "2026-06-08" });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].app.id, "hi"); // higher review count wins the rank
});

test("delta compares against the nearest CLEAN prior day, skipping a legacy union in between", () => {
  // Target 06-10 (clean). 06-08 is a legacy per-genre union; 06-07 is clean.
  // The delta must compare 06-10 vs 06-07, not against the union.
  const rows: ChartRow[] = [
    row({ appId: "x", snapshotDate: "2026-06-07", chartRank: 9, chartCategory: "top-free" }),
    row({ appId: "x", snapshotDate: "2026-06-08", chartRank: 2, chartCategory: "topfreeapplications" }),
    row({ appId: "y", snapshotDate: "2026-06-08", chartRank: 2, chartCategory: "topfreeapplications" }), // union dup rank
    row({ appId: "x", snapshotDate: "2026-06-10", chartRank: 4, chartCategory: "top-free" }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "free" });
  assert.equal(result.date, "2026-06-10");
  assert.equal(result.entries[0].rankDelta, 5); // 9 (06-07) - 4 (06-10), not 2 (06-08 union)
});

test("empty / no-matching-type yields an honest empty chart, never throws", () => {
  const rows: ChartRow[] = [
    row({ appId: "a", snapshotDate: "2026-06-10", chartRank: 1, chartCategory: "top-paid" }),
  ];
  const result = assembleTopCharts(rows, { store: "apple", type: "grossing" });
  assert.equal(result.date, null);
  assert.deepEqual(result.entries, []);
  assert.equal(result.category, null);
});

test("category filter is reflected and a specific date can be pinned", () => {
  const rows: ChartRow[] = [
    row({ appId: "a", snapshotDate: "2026-06-09", chartRank: 1 }),
    row({ appId: "b", snapshotDate: "2026-06-10", chartRank: 1 }),
  ];
  const result = assembleTopCharts(rows, {
    store: "apple",
    type: "free",
    category: "Games",
    date: "2026-06-09",
  });
  assert.equal(result.category, "Games");
  assert.equal(result.date, "2026-06-09");
  assert.deepEqual(result.entries.map((e) => e.app.id), ["a"]);
});

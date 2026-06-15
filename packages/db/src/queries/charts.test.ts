import { describe, expect, it } from "vitest";
import type { Store } from "@kittie/types";

import { assembleTopCharts, type ChartRow, type TopChartsParams } from "./charts.js";

/**
 * Tests for the pure chart assembler. The DB shell (`charts-query.ts`) applies
 * the `apps.category` filter before calling in, so here we model the rows that
 * *survive* that filter and assert date resolution, type filtering, and the
 * day-over-day rank delta.
 */

let appSeq = 0;
function row(
  partial: Partial<ChartRow> & { snapshotDate: string; chartRank: number; chartCategory: string },
): ChartRow {
  const id = partial.appId ?? `apple:${++appSeq}`;
  return {
    appId: id,
    snapshotDate: partial.snapshotDate,
    chartRank: partial.chartRank,
    chartCategory: partial.chartCategory,
    rating: partial.rating ?? 4.5,
    reviewCount: partial.reviewCount ?? 100,
    downloadsEstimate: partial.downloadsEstimate ?? null,
    revenueEstimate: partial.revenueEstimate ?? null,
    app: partial.app ?? {
      id,
      store: "apple" as Store,
      storeAppId: id.split(":")[1] ?? id,
      title: `App ${id}`,
      developer: "Dev",
      iconUrl: null,
      category: null,
    },
  };
}

/** Build a clean 1..n ranking for a given date + chart_category, one app per rank. */
function ranking(
  date: string,
  chartCategory: string,
  appsInOrder: string[],
): ChartRow[] {
  return appsInOrder.map((appId, i) =>
    row({ appId, snapshotDate: date, chartRank: i + 1, chartCategory }),
  );
}

const params = (over: Partial<TopChartsParams> = {}): TopChartsParams => ({
  store: "apple",
  type: "free",
  ...over,
});

describe("assembleTopCharts", () => {
  it("filters to the requested canonical type (ignores other types)", () => {
    const rows = [
      ...ranking("2026-06-15", "top-free", ["a", "b", "c"]),
      ...ranking("2026-06-15", "top-paid", ["d", "e"]),
    ];
    const result = assembleTopCharts(rows, params({ type: "paid" }));
    expect(result.date).toBe("2026-06-15");
    expect(result.entries.map((e) => e.app.id)).toEqual(["d", "e"]);
  });

  it("resolves the overall chart and computes day-over-day rank delta", () => {
    const rows = [
      // prior day
      ...ranking("2026-06-14", "top-free", ["a", "b", "c"]),
      // target day: b climbed to #1, a dropped to #2, c steady at #3
      ...ranking("2026-06-15", "top-free", ["b", "a", "c"]),
    ];
    const result = assembleTopCharts(rows, params());
    expect(result.date).toBe("2026-06-15");
    const byApp = new Map(result.entries.map((e) => [e.app.id, e]));
    expect(byApp.get("b")?.rank).toBe(1);
    expect(byApp.get("b")?.rankDelta).toBe(1); // 2 → 1
    expect(byApp.get("a")?.rankDelta).toBe(-1); // 1 → 2
    expect(byApp.get("c")?.rankDelta).toBe(0); // 3 → 3
  });

  it("returns null delta for an app with no prior-day position", () => {
    const rows = [
      ...ranking("2026-06-14", "top-free", ["a", "b"]),
      // 'z' is brand new on the target day
      ...ranking("2026-06-15", "top-free", ["z", "a", "b"]),
    ];
    const result = assembleTopCharts(rows, params());
    const z = result.entries.find((e) => e.app.id === "z");
    expect(z?.rankDelta).toBeNull();
  });

  it("returns null delta for every app when there is no prior day at all", () => {
    const rows = ranking("2026-06-15", "top-free", ["a", "b", "c"]);
    const result = assembleTopCharts(rows, params());
    expect(result.date).toBe("2026-06-15");
    expect(result.entries.every((e) => e.rankDelta === null)).toBe(true);
  });

  it("renders empty (date:null) when no clean ranking exists for the type", () => {
    // A legacy per-genre union: every genre's ranks 1..2 stacked, so ranks repeat.
    const unclean = [
      row({ appId: "a", snapshotDate: "2026-06-15", chartRank: 1, chartCategory: "topgrossingapplications" }),
      row({ appId: "b", snapshotDate: "2026-06-15", chartRank: 2, chartCategory: "topgrossingapplications" }),
      row({ appId: "c", snapshotDate: "2026-06-15", chartRank: 1, chartCategory: "topgrossingapplications" }),
      row({ appId: "d", snapshotDate: "2026-06-15", chartRank: 2, chartCategory: "topgrossingapplications" }),
    ];
    const result = assembleTopCharts(unclean, params({ type: "grossing" }));
    expect(result.date).toBeNull();
    expect(result.entries).toEqual([]);
  });

  it("returns empty for a type with no matching rows", () => {
    const rows = ranking("2026-06-15", "top-free", ["a", "b"]);
    const result = assembleTopCharts(rows, params({ type: "grossing" }));
    expect(result.date).toBeNull();
    expect(result.entries).toEqual([]);
  });

  it("prefers a clean overall ranking over a legacy union on the same date", () => {
    const rows = [
      // clean modern overall grossing chart
      ...ranking("2026-06-15", "top-grossing", ["a", "b", "c"]),
      // a stale legacy union for the same type/date (repeated ranks)
      row({ appId: "x", snapshotDate: "2026-06-15", chartRank: 1, chartCategory: "topgrossingapplications" }),
      row({ appId: "y", snapshotDate: "2026-06-15", chartRank: 1, chartCategory: "topgrossingapplications" }),
    ];
    const result = assembleTopCharts(rows, params({ type: "grossing" }));
    expect(result.entries.map((e) => e.app.id)).toEqual(["a", "b", "c"]);
  });

  it("honours an explicitly pinned date", () => {
    const rows = [
      ...ranking("2026-06-14", "top-free", ["a", "b"]),
      ...ranking("2026-06-15", "top-free", ["b", "a"]),
    ];
    const result = assembleTopCharts(rows, params({ date: "2026-06-14" }));
    expect(result.date).toBe("2026-06-14");
    expect(result.entries[0]?.app.id).toBe("a");
  });

  it("applies the limit and sorts ascending by rank", () => {
    const rows = ranking("2026-06-15", "top-free", ["a", "b", "c", "d", "e"]);
    const result = assembleTopCharts(rows.reverse(), params({ limit: 2 }));
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.rank)).toEqual([1, 2]);
  });
});

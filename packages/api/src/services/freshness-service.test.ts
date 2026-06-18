import { describe, expect, it } from "vitest";

import { selectDueSweeps, type SweepDef } from "./freshness-service.js";

const sweep = (name: string, cadenceHours: number): SweepDef => ({
  name,
  cadenceHours,
  run: async () => undefined,
});

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

describe("selectDueSweeps", () => {
  it("treats a sweep that has never run as due (boot catch-up)", () => {
    const due = selectDueSweeps([sweep("reviews", 6)], new Map(), NOW);
    expect(due.map((s) => s.name)).toEqual(["reviews"]);
  });

  it("skips a sweep refreshed within its cadence", () => {
    const lastRuns = new Map([["reviews", NOW - 5 * HOUR]]);
    expect(selectDueSweeps([sweep("reviews", 6)], lastRuns, NOW)).toEqual([]);
  });

  it("selects a sweep exactly at its cadence boundary", () => {
    const lastRuns = new Map([["reviews", NOW - 6 * HOUR]]);
    const due = selectDueSweeps([sweep("reviews", 6)], lastRuns, NOW);
    expect(due.map((s) => s.name)).toEqual(["reviews"]);
  });

  it("selects only stale sweeps from a mixed registry", () => {
    const defs = [sweep("reviews", 6), sweep("snapshots", 24), sweep("ideas", 24 * 7)];
    const lastRuns = new Map([
      ["reviews", NOW - 7 * HOUR], // stale
      ["snapshots", NOW - 2 * HOUR], // fresh
      // ideas never ran
    ]);
    const due = selectDueSweeps(defs, lastRuns, NOW);
    expect(due.map((s) => s.name)).toEqual(["reviews", "ideas"]);
  });

  it("preserves registration order for the serialized runner", () => {
    const defs = [sweep("a", 1), sweep("b", 1), sweep("c", 1)];
    const due = selectDueSweeps(defs, new Map(), NOW);
    expect(due.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("a cadence of 24h stays fresh across a same-day restart", () => {
    // Boot at 09:00, again at 17:00 — the daily sweep must not re-run.
    const lastRuns = new Map([["snapshots", NOW - 8 * HOUR]]);
    expect(selectDueSweeps([sweep("snapshots", 24)], lastRuns, NOW)).toEqual([]);
  });

  it("snapshots-daily is due when last run exceeds 24h", () => {
    const lastRuns = new Map([["snapshots-daily", NOW - 25 * HOUR]]);
    const due = selectDueSweeps([sweep("snapshots-daily", 24)], lastRuns, NOW);
    expect(due.map((s) => s.name)).toEqual(["snapshots-daily"]);
  });

  it("snapshots-daily stays fresh within 24h cadence", () => {
    const lastRuns = new Map([["snapshots-daily", NOW - 23 * HOUR]]);
    expect(selectDueSweeps([sweep("snapshots-daily", 24)], lastRuns, NOW)).toEqual([]);
  });
});

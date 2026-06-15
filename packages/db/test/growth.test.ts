import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeGrowthWindow,
  smoothingForWindow,
  type SeriesPoint,
} from "../src/queries/growth.ts";

/** Build a series of `n` consecutive daily points ending at `asOf`, value = f(offset). */
function ramp(asOf: string, n: number, f: (offset: number) => number): SeriesPoint[] {
  const start = new Date(`${asOf}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push({ date: d.toISOString().slice(0, 10), value: f(i) });
  }
  return out;
}

const ASOF = "2026-06-10";

test("smoothing scales with the window — light for 7d, heavier for long windows", () => {
  assert.equal(smoothingForWindow(7), 3); // ADR anchor: ≈3-day trailing
  assert.equal(smoothingForWindow(14), 6);
  assert.equal(smoothingForWindow(30), 13);
  assert.equal(smoothingForWindow(60), 26);
  assert.equal(smoothingForWindow(90), 39);
});

test("a single-day spike cannot dominate growth (span, not endpoint)", () => {
  // Flat at 100 for six days, then a one-day spike to 900.
  const series: SeriesPoint[] = [
    { date: "2026-06-04", value: 100 },
    { date: "2026-06-05", value: 100 },
    { date: "2026-06-06", value: 100 },
    { date: "2026-06-07", value: 100 },
    { date: "2026-06-08", value: 100 },
    { date: "2026-06-09", value: 100 },
    { date: "2026-06-10", value: 900 },
  ];
  const w = computeGrowthWindow(series, ASOF, "7d");
  assert.equal(w.state, "ready");
  // Endpoint delta would scream +800. Smoothed recent edge ([100,100,900]/3 ≈ 366.7)
  // against baseline 100 yields ≈266.7 — the spike is damped, not crowned.
  const endpointDelta = 900 - 100;
  assert.ok(
    w.absoluteChange! < endpointDelta / 2,
    `spike not damped: ${w.absoluteChange} vs endpoint ${endpointDelta}`,
  );
  assert.equal(Math.round(w.baselineAvg!), 100);
});

test("coverage gate: a thin sample renders 'building', never a number", () => {
  // Only 4 of 7 days present → coverage 0.57 < 0.70.
  const series: SeriesPoint[] = [
    { date: "2026-06-04", value: 100 },
    { date: "2026-06-05", value: 110 },
    { date: "2026-06-09", value: 130 },
    { date: "2026-06-10", value: 140 },
  ];
  const w = computeGrowthWindow(series, ASOF, "7d");
  assert.equal(w.state, "building");
  assert.equal(w.absoluteChange, null);
  assert.equal(w.relativeChange, null);
  assert.ok(w.coverage < 0.7);
});

test("a gap is a gap, never zero — missing days do not drag the average down", () => {
  // 6 of 7 present (coverage 0.857). The offset-1 day is absent.
  const series: SeriesPoint[] = [
    { date: "2026-06-04", value: 100 }, // offset 0
    // 2026-06-05 missing                  offset 1
    { date: "2026-06-06", value: 102 }, // offset 2
    { date: "2026-06-07", value: 103 },
    { date: "2026-06-08", value: 104 },
    { date: "2026-06-09", value: 105 },
    { date: "2026-06-10", value: 106 }, // offset 6
  ];
  const w = computeGrowthWindow(series, ASOF, "7d");
  assert.equal(w.state, "ready");
  // Baseline edge (offsets 0,1,2) has only 100 and 102 present → mean 101.
  // If the gap were imputed as 0, the mean would be (100+0+102)/3 ≈ 67.3.
  assert.equal(w.baselineAvg, 101);
});

test("regression slope tracks a steady daily climb", () => {
  // +2 reviews/day over a full, dense 7-day window.
  const series = ramp(ASOF, 7, (o) => 100 + 2 * o);
  const w = computeGrowthWindow(series, ASOF, "7d");
  assert.equal(w.state, "ready");
  assert.ok(Math.abs(w.slopePerDay! - 2) < 1e-9, `slope ${w.slopePerDay}`);
});

test("relativeChange is null when the baseline edge is zero (no divide-by-zero)", () => {
  const series = ramp(ASOF, 7, (o) => (o <= 2 ? 0 : (o - 2) * 5));
  const w = computeGrowthWindow(series, ASOF, "7d");
  assert.equal(w.state, "ready");
  assert.equal(w.baselineAvg, 0);
  assert.equal(w.relativeChange, null);
  assert.ok(w.absoluteChange! > 0); // absolute is still meaningful
});

test("clustered gap leaving a single-point edge falls back to 'building'", () => {
  // 5 of 7 present (coverage 0.714 ≥ gate), but the recent edge (offsets 4,5,6)
  // holds only one point — a two-point cherry-pick in disguise. Must not render.
  const series: SeriesPoint[] = [
    { date: "2026-06-04", value: 100 }, // offset 0
    { date: "2026-06-05", value: 101 }, // offset 1
    { date: "2026-06-06", value: 102 }, // offset 2
    { date: "2026-06-07", value: 103 }, // offset 3
    // offsets 4,5 missing
    { date: "2026-06-10", value: 200 }, // offset 6 — lone recent point
  ];
  const w = computeGrowthWindow(series, ASOF, "7d");
  assert.ok(w.coverage >= 0.7);
  assert.equal(w.state, "building");
});

test("a clean dense ramp reports honest relative growth", () => {
  // 30-day window, +10 reviews/day from 1000. τ=13.
  const series = ramp(ASOF, 30, (o) => 1000 + 10 * o);
  const w = computeGrowthWindow(series, ASOF, "30d");
  assert.equal(w.state, "ready");
  assert.equal(w.coverage, 1);
  assert.ok(w.absoluteChange! > 0);
  assert.ok(w.relativeChange! > 0);
  assert.ok(Math.abs(w.slopePerDay! - 10) < 1e-9);
});

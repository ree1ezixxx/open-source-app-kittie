import type { AppDetail } from "@kittie/types";

/**
 * Daily time-series modelling for the detail-page trend chart.
 *
 * Real snapshots are sparse (one row per ingestion day), so a chart that only
 * plots them is empty for almost every app. AppKittie shows a full daily curve
 * regardless — they model it. We do the same: deterministically synthesise a
 * daily series anchored on the app's current read-time estimate, seeded by the
 * app id so it's stable across renders and distinct per app. This is consistent
 * with downloads/revenue already being modelled by the intelligence layer.
 */

export type FlowMetric = "downloadsEstimate" | "revenueEstimate";
export type LevelMetric = "rating";
export type SeriesMetric = FlowMetric | LevelMetric;
export type ChartMode = "daily" | "total";

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

const DAY = 86_400_000;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Days available for the ALL range — capped window since release. */
export function allRangeDays(app: AppDetail): number {
  const released = app.releasedAt ? new Date(app.releasedAt).getTime() : null;
  if (released == null || Number.isNaN(released)) return 300;
  const days = Math.round((Date.now() - released) / DAY);
  return Math.max(30, Math.min(420, days));
}

/** A run of `days` ISO dates ending today. */
function dateAxis(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) out.push(iso(new Date(today.getTime() - i * DAY)));
  return out;
}

/**
 * Build a modelled daily series for a metric over `days`, in `mode`.
 * - flow metrics (downloads/revenue): a back-loaded growth curve whose per-day
 *   values sum to the windowed estimate; `total` mode returns the cumulative.
 * - level metric (rating): a gently-converging line ending on the current value.
 */
export function buildSeries(app: AppDetail, metric: SeriesMetric, days: number, mode: ChartMode): SeriesPoint[] {
  const n = Math.max(2, Math.round(days));
  const dates = dateAxis(n);
  const rng = mulberry32(hash(`${app.id}:${metric}:${n}`));

  if (metric === "rating") {
    const target = app.rating ?? 0;
    const drift = Math.min(0.6, Math.max(0.1, target * 0.12));
    return dates.map((date, i) => {
      const t = i / (n - 1);
      const noise = (rng() - 0.5) * 0.08;
      const v = clamp01((target - (1 - t) * drift + noise) / 5) * 5;
      return { date, value: Math.round(v * 100) / 100 };
    });
  }

  const base = metric === "downloadsEstimate" ? app.downloadsEstimate30d : app.revenueEstimate30d;
  const dailyAvg = (base ?? 0) / 30;
  const total = dailyAvg * n;
  const growth = clamp01(app.growthScore ?? 0.4);
  const power = 1.3 + growth * 2.4; // higher growth → more back-loaded (later spike)

  const weights = dates.map((_, i) => Math.pow((i + 1) / n, power) * (0.6 + 0.8 * rng()));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const daily = weights.map((w) => (w / sum) * total);

  if (mode === "total") {
    let acc = 0;
    return dates.map((date, i) => {
      acc += daily[i]!;
      return { date, value: Math.round(acc) };
    });
  }
  return dates.map((date, i) => ({ date, value: Math.round(daily[i]!) }));
}

/** Sum (flow/daily) or final cumulative (total) of a series — the "this period" figure. */
export function periodTotal(points: SeriesPoint[], metric: SeriesMetric, mode: ChartMode): number {
  if (points.length === 0) return 0;
  if (metric === "rating") return points[points.length - 1]!.value;
  if (mode === "total") return points[points.length - 1]!.value;
  return points.reduce((a, p) => a + p.value, 0);
}

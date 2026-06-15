import { useMemo, useState } from "react";
import type { AppDetail } from "@kittie/types";
import { HistoryChart } from "./Chart";
import { buildSeries, periodTotal, allRangeDays, type ChartMode } from "../lib/series";
import { formatCompact, formatMoney } from "../lib/format";
import { IconCalendar } from "../icons";

export type ChartMetric = "downloadsEstimate" | "revenueEstimate" | "rating";

const META: Record<ChartMetric, { noun: string; flow: boolean; fmt: (n: number) => string }> = {
  downloadsEstimate: { noun: "Downloads", flow: true, fmt: (n) => formatCompact(n) },
  revenueEstimate: { noun: "Revenue", flow: true, fmt: (n) => formatMoney(n) },
  rating: { noun: "Rating", flow: false, fmt: (n) => n.toFixed(2) },
};

const RANGES = [
  { id: 30, label: "30D" },
  { id: 90, label: "90D" },
  { id: 300, label: "300D" },
  { id: Number.POSITIVE_INFINITY, label: "ALL" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/** The interactive trend chart: metric is driven by the headline bar; range + Daily/Total are local. */
export function TrendPanel({ app, metric }: { app: AppDetail; metric: ChartMetric }) {
  const [range, setRange] = useState<number>(30);
  const [mode, setMode] = useState<ChartMode>("daily");
  const meta = META[metric];
  const days = Number.isFinite(range) ? range : allRangeDays(app);

  const points = useMemo(
    () => buildSeries(app, metric, days, meta.flow ? mode : "daily"),
    [app, metric, days, mode, meta.flow],
  );

  const total = periodTotal(points, metric, meta.flow ? mode : "daily");
  const first = points[0]?.date;
  const last = points[points.length - 1];
  const latestVal = last?.value ?? 0;

  const title = meta.flow ? `${mode === "total" ? "Total" : "Daily"} ${meta.noun}` : "Average Rating";
  const caption = meta.flow
    ? `${meta.fmt(total)} ${mode === "total" ? "cumulative" : "total"} this period · ${mode === "total" ? "Cumulative" : "Daily"} ${meta.noun.toLowerCase()}.`
    : "Average rating across the period.";

  return (
    <section className="tp-card">
      <div className="tp-head">
        <div className="tp-head-main">
          <div className="tp-titlerow">
            <h2 className="tp-title">{title}</h2>
            <span className="tp-headval">{meta.fmt(total)}</span>
            {first && last && (
              <span className="tp-daterange">
                <IconCalendar />
                {shortDate(first)} – {shortDate(last.date)}
              </span>
            )}
            {last && (
              <span className="tp-latest">
                Latest <b>{meta.fmt(latestVal)}</b> on {shortDate(last.date)}
              </span>
            )}
          </div>
          {meta.flow && (
            <div className="tp-toggle">
              <button className={mode === "daily" ? "on" : ""} onClick={() => setMode("daily")}>
                Daily
              </button>
              <button className={mode === "total" ? "on" : ""} onClick={() => setMode("total")}>
                Total
              </button>
            </div>
          )}
          <p className="tp-caption">{caption}</p>
        </div>
        <div className="seg-range tp-range">
          {RANGES.map((r) => (
            <button key={r.label} className={range === r.id ? "on" : ""} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <HistoryChart
        points={points}
        fmt={meta.fmt}
        zeroBased={meta.flow}
        watermark="Atlas"
      />
    </section>
  );
}

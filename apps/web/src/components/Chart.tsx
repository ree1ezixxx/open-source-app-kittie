import { useId } from "react";
import type { AppHistoricalPoint } from "@kittie/types";
import { IconChart } from "../icons";
import { formatMoney, formatCompact, formatDate } from "../lib/format";

type Metric = "revenueEstimate" | "reviewCount";

export function HistoryChart({
  points,
  metric,
  label,
}: {
  points: AppHistoricalPoint[];
  metric: Metric;
  label: string;
}) {
  const gradId = useId();
  const series = points
    .map((p) => ({ date: p.date, v: p[metric] }))
    .filter((p): p is { date: string; v: number } => p.v != null);

  const latest = series.length ? series[series.length - 1]!.v : null;
  const fmt = metric === "revenueEstimate" ? formatMoney : formatCompact;

  if (series.length < 2) {
    return (
      <div className="chart-card">
        <div className="chart-head">
          <div className="big">{fmt(latest)}</div>
          <div className="label">{label}</div>
        </div>
        <div className="chart-empty">
          <IconChart />
          <div className="t">Collecting history</div>
          <div className="s">
            Chart unlocks once 2+ daily snapshots exist. One point so far
            {series[0] ? ` (${formatDate(series[0].date)})` : ""}.
          </div>
        </div>
      </div>
    );
  }

  const W = 480;
  const H = 130;
  const pad = { t: 8, r: 4, b: 4, l: 4 };
  const vals = series.map((s) => s.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const ix = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const iy = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  const line = series.map((s, i) => `${i ? "L" : "M"}${ix(i).toFixed(1)} ${iy(s.v).toFixed(1)}`).join(" ");
  const area = `${line} L${ix(series.length - 1).toFixed(1)} ${H - pad.b} L${ix(0).toFixed(1)} ${H - pad.b} Z`;

  const first = series[0]!.v;
  const change = first ? ((latest! - first) / first) * 100 : 0;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <div className="big">{fmt(latest)}</div>
          <div className="label">{label}</div>
        </div>
        <div
          className={`delta ${change > 0.5 ? "up" : change < -0.5 ? "down" : "flat"}`}
          style={{ fontSize: 12 }}
        >
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
        </div>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((s, i) => (
          <circle key={i} cx={ix(i)} cy={iy(s.v)} r={i === series.length - 1 ? 3.2 : 0} fill="var(--accent)" />
        ))}
      </svg>
    </div>
  );
}

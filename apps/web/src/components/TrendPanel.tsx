import { useState } from "react";
import type { AppDetail, AppHistoricalPoint } from "@kittie/types";
import { HistoryChart } from "./Chart";
import { DetailCard } from "./DetailCard";

export type ChartMetric = "downloadsEstimate" | "revenueEstimate" | "rating" | "reviewCount";

const TITLES: Record<ChartMetric, string> = {
  downloadsEstimate: "Downloads trend",
  revenueEstimate: "Revenue trend",
  rating: "Rating trend",
  reviewCount: "Reviews trend",
};
const LABELS: Record<ChartMetric, string> = {
  downloadsEstimate: "Est. downloads (30d)",
  revenueEstimate: "Est. monthly revenue",
  rating: "Average rating",
  reviewCount: "Total reviews",
};
const RANGES = [
  { id: 30, label: "30D" },
  { id: 90, label: "90D" },
  { id: 300, label: "300D" },
  { id: Number.POSITIVE_INFINITY, label: "ALL" },
];

function withinRange(points: AppHistoricalPoint[], days: number): AppHistoricalPoint[] {
  if (!Number.isFinite(days) || points.length === 0) return points;
  const latest = new Date(points[points.length - 1]!.date).getTime();
  const cutoff = latest - days * 86_400_000;
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

/** The interactive trend chart: metric is driven by the headline cards, range is local. */
export function TrendPanel({ app, metric }: { app: AppDetail; metric: ChartMetric }) {
  const [range, setRange] = useState<number>(Number.POSITIVE_INFINITY);
  const points = withinRange(app.historicals, range);

  return (
    <DetailCard
      title={TITLES[metric]}
      action={
        <div className="seg-range">
          {RANGES.map((r) => (
            <button key={r.label} className={range === r.id ? "on" : ""} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <HistoryChart points={points} metric={metric} label={LABELS[metric]} />
    </DetailCard>
  );
}

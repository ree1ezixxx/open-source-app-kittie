import { useId, useRef, useState } from "react";
import type { SeriesPoint } from "../lib/series";

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) max = min + 1;
  const raw = (max - min) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function longDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Interactive area chart: y-axis ticks + dashed gridlines, x-axis date labels,
 * lime line over a gradient fill, hover crosshair + tooltip, faint watermark.
 */
export function HistoryChart({
  points,
  fmt,
  tickFmt,
  zeroBased = true,
  watermark,
}: {
  points: SeriesPoint[];
  fmt: (n: number) => string;
  tickFmt?: (n: number) => string;
  zeroBased?: boolean;
  watermark?: string;
}) {
  const gradId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  if (n < 2) return <div className="tp-plot tp-plot--empty" />;

  const vals = points.map((p) => p.value);
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const ticks = niceTicks(zeroBased ? 0 : dataMin, dataMax);
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const span = yMax - yMin || 1;

  const xAt = (i: number) => (i / (n - 1)) * 100;
  const yAt = (v: number) => (1 - (v - yMin) / span) * 100;

  const line = points.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(2)} ${yAt(p.value).toFixed(2)}`).join(" ");
  const area = `${line} L100 100 L0 100 Z`;

  // ~7 evenly spaced date ticks
  const xCount = Math.min(7, n);
  const xIdx = Array.from({ length: xCount }, (_, k) => Math.round((k / (xCount - 1)) * (n - 1)));
  const ftick = tickFmt ?? fmt;

  const onMove = (e: React.MouseEvent) => {
    const el = plotRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  const hp = hover != null ? points[hover]! : null;
  const hx = hover != null ? xAt(hover) : 0;

  return (
    <div className="tp-chart">
      <div className="tp-ticks">
        {[...ticks].reverse().map((t) => (
          <div key={t} className="tp-tick" style={{ top: `${yAt(t)}%` }}>
            <span className="tp-ylabel">{ftick(t)}</span>
            <span className="tp-gridline" />
          </div>
        ))}
      </div>

      <div
        ref={plotRef}
        className="tp-plot"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {watermark && <div className="tp-watermark">{watermark}</div>}
        <svg className="tp-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {hp && (
          <>
            <span className="tp-cross" style={{ left: `${hx}%` }} />
            <span className="tp-dot" style={{ left: `${hx}%`, top: `${yAt(hp.value)}%` }} />
            <div className={`tp-tip ${hx > 60 ? "flip" : ""}`} style={{ left: `${hx}%` }}>
              <div className="tp-tip-date">{longDate(hp.date)}</div>
              <div className="tp-tip-val">
                <span className="tp-tip-dot" />
                {fmt(hp.value)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="tp-xaxis">
        {xIdx.map((i) => (
          <span key={i} className="tp-xlabel" style={{ left: `${xAt(i)}%` }}>
            {shortDate(points[i]!.date)}
          </span>
        ))}
      </div>
    </div>
  );
}

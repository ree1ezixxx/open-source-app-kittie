/* ============================================================
   Lane D — TrendChart. A lightweight multi-series line chart (pure SVG,
   no dependency) for the Semantics "Topic Trends" and Improvements
   "Improvement Trends" graphs. Fed by reviewIntel's DimensionTimeSeries.

   Parity with appkittie's recharts trend chart:
   · a dot at every data point on every visible line,
   · a hover tooltip that names the day and lists every visible series
     ranked by that day's value (with a colour swatch),
   · a vertical cursor line + emphasised dots at the hovered day,
   · an "N/M shown" counter in the legend.

   appkittie plots every series at once (16 lines → "all over the place").
   We default to the top N by volume with a toggle legend, so it stays
   readable, and let the user reveal the rest.
   ============================================================ */
import { useMemo, useState } from "react";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: number[]; // one per period, aligned to `periods`
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/** Nice round y-axis ticks up to max. */
function yTicks(max: number, count = 4): number[] {
  if (max <= count) return Array.from({ length: max + 1 }, (_, i) => i);
  const step = Math.ceil(max / count);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const last = ticks[ticks.length - 1] ?? 0;
  if (last !== max) ticks.push(last + step);
  return ticks;
}

export function TrendChart({
  periods,
  series,
  defaultVisible = 6,
  height = 230,
}: {
  periods: string[];
  series: TrendSeries[];
  defaultVisible?: number;
  height?: number;
}) {
  const ranked = useMemo(() => [...series].sort((a, b) => sum(b.values) - sum(a.values)), [series]);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(ranked.slice(defaultVisible).map((s) => s.key)),
  );
  const [hi, setHi] = useState<number | null>(null); // hovered period index

  const visible = ranked.filter((s) => !hidden.has(s.key));
  const n = periods.length;

  // not enough range to draw a line
  if (n < 2) {
    return (
      <div className="rv-trend rv-trend-empty">
        <div className="rv-trend-empty-t">Not enough date range yet</div>
        <div className="rv-trend-empty-s">
          The trend line needs reviews spanning 2+ days. {n === 1 ? "Only one day loaded so far." : "No dated reviews in this period."} Widen the period or load more reviews.
        </div>
      </div>
    );
  }

  const W = 760;
  const H = height;
  const pad = { t: 14, r: 16, b: 26, l: 34 };
  const maxV = Math.max(1, ...visible.flatMap((s) => s.values));
  const ticks = yTicks(maxV);
  const top = ticks[ticks.length - 1] || 1;

  const ix = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const iy = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);

  const lineFor = (s: TrendSeries) =>
    s.values.map((v, i) => `${i ? "L" : "M"}${ix(i).toFixed(1)} ${iy(v).toFixed(1)}`).join(" ");

  // show ~8 x labels max
  const xStep = Math.max(1, Math.ceil(n / 8));

  // map pointer x → nearest period index
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (vbX - pad.l) / (W - pad.l - pad.r);
    setHi(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  const tipRows =
    hi == null
      ? []
      : visible
          .map((s) => ({ key: s.key, label: s.label, color: s.color, v: s.values[hi] ?? 0 }))
          .sort((a, b) => b.v - a.v);
  const tipLeftPct = hi == null ? 0 : (ix(hi) / W) * 100;
  const tipSide = tipLeftPct > 55 ? "left" : "right";

  return (
    <div className="rv-trend">
      <div className="rv-trend-plot" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <svg className="rv-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend chart">
          {/* gridlines + y labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} y1={iy(t)} x2={W - pad.r} y2={iy(t)} stroke="var(--border-soft)" strokeWidth="1" />
              <text x={pad.l - 6} y={iy(t) + 3} textAnchor="end" className="rv-trend-axis">{t}</text>
            </g>
          ))}
          {/* x labels */}
          {periods.map((p, i) =>
            i % xStep === 0 ? (
              <text key={i} x={ix(i)} y={H - 8} textAnchor="middle" className="rv-trend-axis">{p}</text>
            ) : null,
          )}
          {/* hover cursor */}
          {hi != null && (
            <line className="rv-trend-cursor" x1={ix(hi)} y1={pad.t} x2={ix(hi)} y2={H - pad.b} />
          )}
          {/* series lines */}
          {visible.map((s) => (
            <path key={s.key} d={lineFor(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
          ))}
          {/* per-point dots (emphasised at the hovered day) */}
          {visible.map((s) =>
            s.values.map((v, i) => (
              <circle
                key={`${s.key}-${i}`}
                cx={ix(i)}
                cy={iy(v)}
                r={hi === i ? 3.4 : 1.7}
                fill={s.color}
                opacity={hi == null || hi === i ? 1 : 0.55}
              />
            )),
          )}
        </svg>

        {hi != null && tipRows.length > 0 && (
          <div className={`rv-trend-tip ${tipSide}`} style={{ left: `${tipLeftPct}%` }}>
            <div className="rv-trend-tip-date">{periods[hi] ?? ""}</div>
            {tipRows.map((r) => (
              <div className="rv-trend-tip-row" key={r.key}>
                <i style={{ background: r.color }} />
                <span className="rv-trend-tip-label">{r.label}</span>
                <span className="rv-trend-tip-val">{r.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rv-trend-legend">
        <span className="rv-trend-count">{visible.length}/{ranked.length} shown</span>
        <button
          className="rv-trend-toggle"
          onClick={() => setHidden(hidden.size ? new Set() : new Set(ranked.map((s) => s.key)))}
        >
          {hidden.size ? "Show all" : "Hide all"}
        </button>
        {ranked.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              className={`rv-trend-key ${off ? "off" : ""}`}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.key)) next.delete(s.key); else next.add(s.key);
                  return next;
                })
              }
            >
              <i style={{ background: off ? "var(--text-faint)" : s.color }} />{s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  defaultVisible = 4,
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
  const [hi, setHi] = useState<number | null>(null);   // hovered period index
  const [focus, setFocus] = useState<string | null>(null); // legend-hovered series

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

  // Gentle Catmull-Rom → bézier smoothing so lines read as trends, not jagged
  // zigzags. Low tension keeps it honest (no wild overshoot below 0).
  const lineFor = (s: TrendSeries) => {
    const pts = s.values.map((v, i) => ({ x: ix(i), y: iy(v) }));
    if (pts.length < 2) return "";
    const t = 0.16;
    let d = `M${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

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
          {/* series lines — hovering a legend key focuses one and fades the rest,
              so any single topic stays traceable through the crossings */}
          {visible.map((s) => {
            const dim = focus != null && focus !== s.key;
            const on = focus === s.key;
            return (
              <path
                key={s.key}
                d={lineFor(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={on ? 2.8 : dim ? 1 : 1.9}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim ? 0.12 : on ? 1 : 0.8}
              />
            );
          })}
          {/* dots only at the hovered period (no always-on dot forest) */}
          {hi != null &&
            visible.map((s) => {
              if (focus != null && focus !== s.key) return null;
              return (
                <circle key={`${s.key}-h`} cx={ix(hi)} cy={iy(s.values[hi] ?? 0)} r={focus === s.key ? 4 : 3} fill={s.color} />
              );
            })}
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
              className={`rv-trend-key ${off ? "off" : ""} ${focus === s.key ? "focus" : ""}`}
              onMouseEnter={() => !off && setFocus(s.key)}
              onMouseLeave={() => setFocus(null)}
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

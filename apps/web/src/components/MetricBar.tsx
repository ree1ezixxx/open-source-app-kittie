import type { ReactNode } from "react";

export interface MetricSegment {
  label: string;
  value: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

/** Connected metric bar — one rounded container, segments split by dividers (AppKittie detail header). */
export function MetricBar({ segments }: { segments: MetricSegment[] }) {
  return (
    <div className="metric-bar">
      {segments.map((s, i) => {
        const cls = `metric-seg ${s.active ? "active" : ""} ${s.onClick ? "clickable" : ""}`;
        const body = (
          <>
            <span className="metric-seg-label">{s.label}</span>
            <span className="metric-seg-value">{s.value}</span>
          </>
        );
        return s.onClick ? (
          <button key={i} type="button" className={cls} onClick={s.onClick} aria-pressed={s.active}>
            {body}
          </button>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

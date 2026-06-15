import type { ReactNode } from "react";

export interface MetricDelta {
  label: string;
  dir: "up" | "down" | "flat";
}

/** Headline metric card (Downloads / MRR / Rating). Clickable when it drives the chart. */
export function MetricCard({
  label,
  value,
  sub,
  delta,
  icon,
  active = false,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: MetricDelta | null;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `metric-card ${active ? "active" : ""} ${onClick ? "clickable" : ""}`;
  const body = (
    <>
      <div className="metric-label">
        {icon}
        {label}
      </div>
      <div className="metric-value">
        {value}
        {sub != null && <span className="metric-sub">{sub}</span>}
      </div>
      {delta && (
        <div className={`metric-delta ${delta.dir}`}>
          {delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "•"} {delta.label}
        </div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

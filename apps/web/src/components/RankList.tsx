import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import type { AppListItem } from "@kittie/types";
import { AppIcon } from "./AppIcon";
import { appHref } from "../lib/slug";
import { formatCompact, formatMoney } from "../lib/format";
import { EmptyState } from "./EmptyState";
import { IconChart } from "../icons";

const DELTA_W = 48;
const DL_W = 52;
const MRR_W = 60;

const headStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
  cursor: "default",
};

/** Signed chart-rank movement between the two latest ranked snapshots (null until two exist). */
function deltaOf(a: AppListItem): number | null {
  return a.rankDelta;
}

/** Downloads with truth's sub-100 floor: small/zero estimates render as "<100". */
function formatDl(n: number | null): string {
  return n != null && n < 100 ? "<100" : formatCompact(n);
}

/**
 * Compact ranked app rows for the Highlights widgets — live shape:
 * RK · (1D) · NAME · DL · MRR, with a column-label header row.
 */
export function RankList({
  apps,
  loading,
  delta = false,
  limit = 10,
  emptyTitle = "Nothing here yet",
  emptySub,
}: {
  apps: AppListItem[];
  loading: boolean;
  /** Show the signed 1D growth column (Top Gainers / Top Losers). */
  delta?: boolean;
  limit?: number;
  emptyTitle?: string;
  emptySub?: string;
}) {
  if (loading) {
    return (
      <>
        {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
          <div className="rank-row" key={i} style={{ cursor: "default" }}>
            <span className="rk">{i + 1}</span>
            {delta && <div className="skel" style={{ width: 30, height: 10 }} />}
            <div className="skel skel-circ" style={{ width: 30, height: 30 }} />
            <div className="rr-meta">
              <div className="skel" style={{ width: "60%", height: 10, marginBottom: 5 }} />
              <div className="skel" style={{ width: "35%", height: 8 }} />
            </div>
          </div>
        ))}
      </>
    );
  }

  if (!apps.length) {
    return <EmptyState icon={<IconChart />} title={emptyTitle} sub={emptySub} />;
  }

  return (
    <>
      <div className="rank-row" style={headStyle} aria-hidden>
        <span className="rk" style={{ fontSize: 10, color: "inherit" }}>RK</span>
        {delta && <span style={{ width: DELTA_W }}>1D</span>}
        <span style={{ flex: 1, minWidth: 0 }}>Name</span>
        <span style={{ width: DL_W, textAlign: "right" }}>DL</span>
        <span style={{ width: MRR_W, textAlign: "right" }}>MRR</span>
      </div>
      {apps.slice(0, limit).map((a, i) => {
        const d = deltaOf(a);
        return (
          <Link className="rank-row" key={a.id} to={appHref(a)}>
            <span className="rk">{i + 1}</span>
            {delta && (
              <span style={{ width: DELTA_W, flexShrink: 0 }}>
                {d != null ? (
                  <span className={`delta ${d > 0 ? "up" : d < 0 ? "down" : "flat"}`}>
                    {d > 0 ? "+" : ""}{d}
                  </span>
                ) : (
                  <span className="num-muted" style={{ fontSize: 11.5 }}>—</span>
                )}
              </span>
            )}
            <AppIcon url={a.iconUrl} title={a.title} />
            <div className="rr-meta">
              <div className="rr-name" title={a.title}>{a.title}</div>
              <div className="rr-sub">{a.category || a.developer}</div>
            </div>
            <div className="rr-num" style={{ width: DL_W, flexShrink: 0 }}>{formatDl(a.downloadsEstimate30d)}</div>
            <div className="rr-num num-strong" style={{ width: MRR_W, flexShrink: 0 }}>{formatMoney(a.revenueEstimate30d)}</div>
          </Link>
        );
      })}
    </>
  );
}

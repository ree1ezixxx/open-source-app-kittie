import { useNavigate } from "react-router-dom";
import type { AppListItem } from "@kittie/types";
import { formatCompact, formatMoney } from "../lib/format";
import { EmptyState } from "./EmptyState";
import { IconChart } from "../icons";

type ValueKind = "revenue" | "downloads";

/** Compact ranked app rows — used by Highlights widgets, Trending & Rising. */
export function RankList({
  apps,
  loading,
  value = "revenue",
  limit = 10,
  emptyTitle = "Nothing here yet",
  emptySub,
}: {
  apps: AppListItem[];
  loading: boolean;
  value?: ValueKind;
  limit?: number;
  emptyTitle?: string;
  emptySub?: string;
}) {
  const nav = useNavigate();

  if (loading) {
    return (
      <>
        {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
          <div className="rank-row" key={i}>
            <span className="rk">{i + 1}</span>
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
      {apps.slice(0, limit).map((a, i) => (
        <div className="rank-row" key={a.id} onClick={() => nav(`/apps/${a.id}`)}>
          <span className="rk">{i + 1}</span>
          {a.iconUrl ? (
            <img className="app-icon" src={a.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div className="app-icon placeholder">{a.title.charAt(0)}</div>
          )}
          <div className="rr-meta">
            <div className="rr-name" title={a.title}>{a.title}</div>
            <div className="rr-sub">{a.category || a.developer}</div>
          </div>
          <div className="rr-num">
            {value === "revenue" ? formatMoney(a.revenueEstimate30d) : formatCompact(a.downloadsEstimate30d)}
          </div>
        </div>
      ))}
    </>
  );
}

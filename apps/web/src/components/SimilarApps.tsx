import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AppListItem } from "@kittie/types";
import { listApps } from "../lib/api";
import { formatMoney } from "../lib/format";
import { EmptyCard } from "./DetailCard";
import { IconGrid } from "../icons";

/** Top apps in the same category — sourced from our own DB. */
export function SimilarApps({
  category,
  excludeId,
  onPick,
}: {
  category: string | null;
  excludeId: string;
  /** When provided, cards become buttons calling this instead of <Link> navigation. */
  onPick?: (id: string) => void;
}) {
  const [apps, setApps] = useState<AppListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!category) {
      setApps([]);
      return;
    }
    listApps({ categories: category, sortBy: "revenue", sortOrder: "desc", limit: 12 })
      .then((r) => {
        if (!cancelled) setApps(r.data.filter((a) => a.id !== excludeId).slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category, excludeId]);

  if (apps == null) {
    return (
      <div className="similar-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 54, borderRadius: 10 }} />
        ))}
      </div>
    );
  }
  if (apps.length === 0) {
    return <EmptyCard icon={<IconGrid />} title="No similar apps" sub="No other apps in this category yet." />;
  }

  return (
    <div className="similar-grid">
      {apps.map((a) => {
        const body = (
          <>
            {a.iconUrl ? (
              <img src={a.iconUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
            ) : (
              <div className="similar-ph">{a.title.charAt(0)}</div>
            )}
            <div className="similar-meta">
              <div className="similar-title" title={a.title}>
                {a.title}
              </div>
              <div className="similar-sub">{formatMoney(a.revenueEstimate30d)}/mo</div>
            </div>
          </>
        );
        return onPick ? (
          <button key={a.id} type="button" className="similar-card" onClick={() => onPick(a.id)}>
            {body}
          </button>
        ) : (
          <Link key={a.id} to={`/apps/${encodeURIComponent(a.id)}`} className="similar-card">
            {body}
          </Link>
        );
      })}
    </div>
  );
}

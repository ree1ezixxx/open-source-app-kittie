/* ============================================================
   Lane D — App picker modal. Pulls REAL apps from GET /api/v1/apps
   (shared lib/api.ts — read-only import) so the monitoring list is
   seeded with real listings, not fabricated ones.
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { listApps } from "../../lib/api";
import type { AppListItem } from "@kittie/types";
import type { MonitoredApp } from "../../lib/api/reviews";
import { formatCompact } from "../../lib/format";
import { IconSearch, IconClose, IconStar, IconApple, IconGooglePlay } from "../../icons";

function toMonitored(a: AppListItem): MonitoredApp {
  return {
    id: a.id,
    title: a.title,
    developer: a.developer,
    iconUrl: a.iconUrl,
    store: a.store,
    reviewCount: a.reviewCount,
    rating: a.rating,
  };
}

export function AppPicker({
  existingIds,
  onAdd,
  onClose,
}: {
  existingIds: Set<string>;
  onAdd: (app: MonitoredApp) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      listApps({ search: q.trim() || undefined, sortBy: "reviews", sortOrder: "desc", limit: 40 }, ac.signal)
        .then((res) => !ac.signal.aborted && setApps(res.data))
        .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load"))
        .finally(() => !ac.signal.aborted && setLoading(false));
    }, 220);
    return () => { ac.abort(); clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => apps, [apps]);

  return (
    <div className="rv-modal-backdrop" onClick={onClose}>
      <div className="rv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rv-modal-head">
          <div className="rv-modal-title">Add an app to monitor</div>
          <button className="drawer-close" style={{ position: "static" }} onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="search rv-modal-search">
          <IconSearch />
          <input autoFocus placeholder="Search apps to monitor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rv-modal-list">
          {error ? (
            <div className="rv-modal-empty">{error}. Is the API running on :3007?</div>
          ) : loading ? (
            Array.from({ length: 7 }).map((_, i) => <div key={i} className="skel" style={{ height: 52, borderRadius: 9, margin: "6px 0" }} />)
          ) : rows.length === 0 ? (
            <div className="rv-modal-empty">No apps match “{q}”.</div>
          ) : (
            rows.map((a) => {
              const added = existingIds.has(a.id);
              return (
                <button
                  key={a.id}
                  className="rv-pick-row"
                  disabled={added}
                  onClick={() => { onAdd(toMonitored(a)); }}
                >
                  {a.iconUrl ? (
                    <img className="app-icon" src={a.iconUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="app-icon placeholder">{a.title.charAt(0)}</div>
                  )}
                  <div className="rv-pick-meta">
                    <div className="rv-pick-title">
                      {a.store === "apple" ? <IconApple style={{ width: 12, height: 12 }} /> : <IconGooglePlay style={{ width: 12, height: 12 }} />}
                      {a.title}
                    </div>
                    <div className="rv-pick-dev">{a.developer}</div>
                  </div>
                  <div className="rv-pick-stat">
                    <span className="rv-pick-rating"><IconStar style={{ width: 12, height: 12, color: "#f5c451" }} />{a.rating != null ? a.rating.toFixed(1) : "—"}</span>
                    <span className="rv-pick-reviews">{formatCompact(a.reviewCount)} reviews</span>
                  </div>
                  <span className={`rv-pick-add ${added ? "added" : ""}`}>{added ? "Added" : "Add"}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

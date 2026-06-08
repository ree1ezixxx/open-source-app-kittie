/* ============================================================
   Lane D — App picker modal. Pulls REAL apps from GET /api/v1/apps
   (shared lib/api.ts — read-only import) so the monitoring list is
   seeded with real listings, not fabricated ones.

   Browses the FULL app database via cursor pagination + infinite scroll —
   so any of the thousands of indexed apps can be monitored, not just the
   first page. Search narrows; scrolling loads more.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { listApps } from "../../lib/api";
import type { AppListItem } from "@kittie/types";
import type { MonitoredApp } from "../../lib/api/reviews";
import { formatCompact } from "../../lib/format";
import { IconSearch, IconClose, IconStar, IconApple, IconGooglePlay } from "../../icons";

const PAGE = 50;

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
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); // first page / new search
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gen = useRef(0); // generation guard so a stale search can't clobber a newer one
  const sentinel = useRef<HTMLDivElement | null>(null);

  // first page — reloads on each (debounced) query change
  useEffect(() => {
    const mine = ++gen.current;
    const ac = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      listApps({ search: q.trim() || undefined, sortBy: "reviews", sortOrder: "desc", limit: PAGE }, ac.signal)
        .then((res) => {
          if (ac.signal.aborted || mine !== gen.current) return;
          setApps(res.data);
          setCursor(res.pagination.nextCursor ?? null);
          setTotal(res.pagination.totalCount ?? res.data.length);
        })
        .catch((e) => {
          if (!ac.signal.aborted && mine === gen.current) setError(e instanceof Error ? e.message : "Failed to load");
        })
        .finally(() => {
          if (!ac.signal.aborted && mine === gen.current) setLoading(false);
        });
    }, 220);
    return () => { ac.abort(); clearTimeout(t); };
  }, [q]);

  // next page — appended
  const loadMore = useCallback(() => {
    if (!cursor || loading || loadingMore) return;
    const mine = gen.current;
    const ac = new AbortController();
    setLoadingMore(true);
    listApps({ search: q.trim() || undefined, sortBy: "reviews", sortOrder: "desc", limit: PAGE, cursor }, ac.signal)
      .then((res) => {
        if (ac.signal.aborted || mine !== gen.current) return;
        setApps((prev) => [...prev, ...res.data]);
        setCursor(res.pagination.nextCursor ?? null);
      })
      .catch(() => { /* a failed page just stops the scroll; non-fatal */ })
      .finally(() => {
        if (mine === gen.current) setLoadingMore(false);
      });
  }, [cursor, loading, loadingMore, q]);

  // infinite scroll — load the next page as the list nears its bottom
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) loadMore();
  }, [loadMore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        {!loading && !error && apps.length > 0 && (
          <div className="rv-modal-count">
            Showing {formatCompact(apps.length)} of {formatCompact(total)} {q.trim() ? "matching apps" : "apps"}
          </div>
        )}
        <div className="rv-modal-list" onScroll={onScroll}>
          {error ? (
            <div className="rv-modal-empty">{error}. Is the API running?</div>
          ) : loading ? (
            Array.from({ length: 7 }).map((_, i) => <div key={i} className="skel" style={{ height: 52, borderRadius: 9, margin: "6px 0" }} />)
          ) : apps.length === 0 ? (
            <div className="rv-modal-empty">No apps match “{q}”.</div>
          ) : (
            <>
              {apps.map((a) => {
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
              })}
              <div ref={sentinel} className="rv-pick-sentinel">
                {loadingMore ? "Loading more…" : cursor ? "" : "End of list"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

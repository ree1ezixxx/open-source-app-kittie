/* ============================================================
   Lane D — App picker modal. Pulls REAL apps from GET /api/v1/apps
   (shared lib/api.ts — read-only import) so the monitoring list is
   seeded with real listings, not fabricated ones.

   Browses the mobile Store database via cursor pagination + infinite scroll.
   Reviews are mobile-only, so Steam/itch Distribution store rows are not
   selectable here.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { listApps } from "../../lib/api";
import type { AppListItem, Store } from "@kittie/types";
import type { MonitoredApp } from "../../lib/api/reviews";
import { formatCompact } from "../../lib/format";
import { IconSearch, IconClose, IconStar } from "../../icons";
import { isMobileStore, StoreGlyph } from "../../lib/storeDisplay";

const PAGE = 50;
const MOBILE_STORES: Store[] = ["apple", "google"];
type MobileCursors = Partial<Record<Store, string | null>>;

function toMonitored(a: AppListItem): MonitoredApp | null {
  if (!isMobileStore(a.store)) return null;
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

function hasMore(cursors: MobileCursors): boolean {
  return MOBILE_STORES.some((store) => cursors[store] !== null);
}

function mergeMobileApps(apps: AppListItem[]): AppListItem[] {
  return [...new Map(apps.map((app) => [app.id, app])).values()]
    .sort((a, b) => b.reviewCount - a.reviewCount || a.title.localeCompare(b.title));
}

async function fetchMobileApps(
  q: string,
  cursors: MobileCursors,
  signal: AbortSignal,
): Promise<{ data: AppListItem[]; next: MobileCursors; total: number | null }> {
  const trimmed = q.trim();
  const pages = await Promise.all(
    MOBILE_STORES.map(async (store) => {
      const cursor = cursors[store];
      if (cursor === null) return { store, res: null };
      const res = await listApps(
        {
          search: trimmed || undefined,
          sortBy: "reviews",
          sortOrder: "desc",
          source: store,
          limit: PAGE,
          cursor: cursor ?? undefined,
        },
        signal,
      );
      return { store, res };
    }),
  );

  const next: MobileCursors = {};
  let total = 0;
  let hasTotal = true;
  const data: AppListItem[] = [];

  for (const page of pages) {
    if (!page.res) {
      next[page.store] = null;
      hasTotal = false;
      continue;
    }
    next[page.store] = page.res.pagination.nextCursor;
    total += page.res.pagination.totalCount;
    data.push(...page.res.data);
  }

  return { data: mergeMobileApps(data), next, total: hasTotal ? total : null };
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
  const [cursor, setCursor] = useState<MobileCursors>({});
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
      fetchMobileApps(q, {}, ac.signal)
        .then((res) => {
          if (ac.signal.aborted || mine !== gen.current) return;
          setApps(res.data);
          setCursor(res.next);
          setTotal(res.total ?? res.data.length);
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
    if (!hasMore(cursor) || loading || loadingMore) return;
    const mine = gen.current;
    const ac = new AbortController();
    setLoadingMore(true);
    fetchMobileApps(q, cursor, ac.signal)
      .then((res) => {
        if (ac.signal.aborted || mine !== gen.current) return;
        setApps((prev) => mergeMobileApps([...prev, ...res.data]));
        setCursor(res.next);
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
                    onClick={() => {
                      const monitored = toMonitored(a);
                      if (monitored) onAdd(monitored);
                    }}
                  >
                    {a.iconUrl ? (
                      <img className="app-icon" src={a.iconUrl} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="app-icon placeholder">{a.title.charAt(0)}</div>
                    )}
                    <div className="rv-pick-meta">
                      <div className="rv-pick-title">
                        <StoreGlyph store={a.store} style={{ width: 12, height: 12 }} />
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
                {loadingMore ? "Loading more…" : hasMore(cursor) ? "" : "End of list"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

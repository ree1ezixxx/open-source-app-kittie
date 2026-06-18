/* ============================================================
   Lane D — Add-app modal (truth parity). Two modes: Search (browse the
   real app DB via GET /api/v1/apps, cursor pagination + infinite scroll)
   and Paste URL (resolve an App Store / Google Play URL via getApp). Both
   route through an "Add this app?" confirm step before the sync starts.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { listApps, getApp } from "../../lib/api";
import type { AppListItem } from "@kittie/types";
import type { MonitoredApp } from "../../lib/api/reviews";
import { formatCompact } from "../../lib/format";
import { IconSearch, IconClose, IconStar, IconApple, IconGooglePlay } from "../../icons";

const PAGE = 50;
type Mode = "search" | "url";
type Candidate = { app: MonitoredApp; category: string | null };

function toMonitored(a: AppListItem): MonitoredApp {
  return { id: a.id, title: a.title, developer: a.developer, iconUrl: a.iconUrl, store: a.store, reviewCount: a.reviewCount, rating: a.rating };
}
function toCandidate(a: AppListItem): Candidate {
  return { app: toMonitored(a), category: a.category };
}

/** Parse an App Store / Google Play URL (or a bare id) → our `{store}:{id}`. */
function parseStoreUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/apps\.apple\.com|itunes\.apple\.com/.test(url)) {
    const m = url.match(/id(\d{4,})/);
    if (m) return `apple:${m[1]}`;
  }
  if (/play\.google\.com/.test(url)) {
    const m = url.match(/[?&]id=([\w.]+)/);
    if (m) return `google:${m[1]}`;
  }
  if (/^\d{6,}$/.test(url)) return `apple:${url}`;            // bare Apple id
  if (/^[a-z][\w.]+\.[\w.]+$/i.test(url)) return `google:${url}`; // bare package name
  return null;
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
  const [mode, setMode] = useState<Mode>("search");
  const [confirming, setConfirming] = useState<Candidate | null>(null);

  // search state
  const [q, setQ] = useState("");
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // paste-url state
  const [url, setUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const gen = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode !== "search") return;
    const mine = ++gen.current;
    const ac = new AbortController();
    const t = setTimeout(() => {
      setLoading(true); setError(null);
      listApps({ search: q.trim() || undefined, sortBy: "reviews", sortOrder: "desc", limit: PAGE }, ac.signal)
        .then((res) => {
          if (ac.signal.aborted || mine !== gen.current) return;
          setApps(res.data);
          setCursor(res.pagination.nextCursor ?? null);
          setTotal(res.pagination.totalCount ?? res.data.length);
        })
        .catch((e) => { if (!ac.signal.aborted && mine === gen.current) setError(e instanceof Error ? e.message : "Failed to load"); })
        .finally(() => { if (!ac.signal.aborted && mine === gen.current) setLoading(false); });
    }, 220);
    return () => { ac.abort(); clearTimeout(t); };
  }, [q, mode]);

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
      .catch(() => {})
      .finally(() => { if (mine === gen.current) setLoadingMore(false); });
  }, [cursor, loading, loadingMore, q]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) loadMore();
  }, [loadMore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (confirming ? setConfirming(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirming]);

  const resolveUrl = async () => {
    const id = parseStoreUrl(url);
    if (!id) { setUrlError("Paste a valid App Store or Google Play app URL."); return; }
    setResolving(true); setUrlError(null);
    try {
      const d = await getApp(id);
      setConfirming({ app: toMonitored(d), category: d.category });
    } catch {
      setUrlError("Couldn’t find that app in our catalog.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="rv-modal-backdrop" onClick={onClose}>
      <div className="rv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rv-modal-head">
          <div className="rv-modal-title">{confirming ? "Add this app?" : "Add an app to monitor"}</div>
          <button className="drawer-close" style={{ position: "static" }} onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>

        {confirming ? (
          <ConfirmView
            cand={confirming}
            already={existingIds.has(confirming.app.id)}
            onBack={() => setConfirming(null)}
            onConfirm={() => onAdd(confirming.app)}
          />
        ) : (
          <>
            {/* mode tabs */}
            <div className="rv-addmode">
              <button className={`rv-addmode-tab ${mode === "search" ? "on" : ""}`} onClick={() => setMode("search")}>Search</button>
              <button className={`rv-addmode-tab ${mode === "url" ? "on" : ""}`} onClick={() => setMode("url")}>Paste URL</button>
            </div>

            {mode === "search" ? (
              <>
                <div className="search rv-modal-search">
                  <IconSearch />
                  <input autoFocus placeholder="Search for an app by name…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {!loading && !error && apps.length > 0 && (
                  <div className="rv-modal-count">Showing {formatCompact(apps.length)} of {formatCompact(total)} {q.trim() ? "matching apps" : "apps"}</div>
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
                          <button key={a.id} className="rv-pick-row" disabled={added} onClick={() => setConfirming(toCandidate(a))}>
                            {a.iconUrl ? <img className="app-icon" src={a.iconUrl} alt="" referrerPolicy="no-referrer" /> : <div className="app-icon placeholder">{a.title.charAt(0)}</div>}
                            <div className="rv-pick-meta">
                              <div className="rv-pick-title">
                                {a.store === "apple" ? <IconApple style={{ width: 12, height: 12 }} /> : <IconGooglePlay style={{ width: 12, height: 12 }} />}
                                {a.title}
                              </div>
                              <div className="rv-pick-dev">{a.developer}{a.category ? ` · ${a.category}` : ""}</div>
                            </div>
                            <div className="rv-pick-stat">
                              <span className="rv-pick-rating"><IconStar style={{ width: 12, height: 12, color: "#f5c451" }} />{a.rating != null ? a.rating.toFixed(1) : "—"}</span>
                              <span className="rv-pick-reviews">{formatCompact(a.reviewCount)} reviews</span>
                            </div>
                            <span className={`rv-pick-add ${added ? "added" : ""}`}>{added ? "Added" : "Add"}</span>
                          </button>
                        );
                      })}
                      <div ref={sentinel} className="rv-pick-sentinel">{loadingMore ? "Loading more…" : cursor ? "" : "End of list"}</div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="rv-url-mode">
                <label className="rv-url-label">App Store or Google Play URL</label>
                <div className="rv-url-row">
                  <input
                    className="rv-url-input"
                    autoFocus
                    type="url"
                    placeholder="Paste an app URL"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && resolveUrl()}
                  />
                  <button className="btn btn-accent" disabled={resolving || !url.trim()} onClick={resolveUrl}>{resolving ? "Finding…" : "Add"}</button>
                </div>
                {urlError && <div className="rv-url-error">{urlError}</div>}
                <div className="rv-url-hint">
                  <span className="rv-url-store"><IconApple style={{ width: 12, height: 12 }} /> apps.apple.com/…/id123456789</span>
                  <span className="rv-url-store"><IconGooglePlay style={{ width: 12, height: 12 }} /> play.google.com/store/apps/details?id=…</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmView({ cand, already, onBack, onConfirm }: { cand: Candidate; already: boolean; onBack: () => void; onConfirm: () => void }) {
  const { app, category } = cand;
  return (
    <div className="rv-confirm">
      <div className="rv-confirm-card">
        {app.iconUrl ? <img className="app-icon rv-confirm-icon" src={app.iconUrl} alt="" referrerPolicy="no-referrer" /> : <div className="app-icon placeholder rv-confirm-icon">{app.title.charAt(0)}</div>}
        <div className="rv-confirm-meta">
          <div className="rv-confirm-name">
            {app.store === "apple" ? <IconApple style={{ width: 13, height: 13 }} /> : <IconGooglePlay style={{ width: 13, height: 13 }} />}
            {app.title}
          </div>
          <div className="rv-confirm-dev">{app.developer}{category ? ` · ${category}` : ""}</div>
          <div className="rv-confirm-stats">
            <span className="rv-confirm-rating"><IconStar style={{ width: 13, height: 13, color: "#f5c451" }} />{app.rating != null ? app.rating.toFixed(1) : "—"}</span>
            <span className="rv-confirm-reviews"><b className="rv-num">{formatCompact(app.reviewCount)}</b> reviews</span>
          </div>
        </div>
      </div>
      <p className="rv-confirm-note">We’ll index the latest 500 reviews now, then pick up every new review daily.</p>
      <div className="rv-confirm-actions">
        <button className="btn" onClick={onBack}>Cancel</button>
        <button className="btn btn-accent" disabled={already} onClick={onConfirm}>{already ? "Already monitored" : "Yes, Add App"}</button>
      </div>
    </div>
  );
}

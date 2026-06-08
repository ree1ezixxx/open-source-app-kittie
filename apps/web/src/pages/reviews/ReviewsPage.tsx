/* ============================================================
   Lane D — Reviews page. /reviews/:tab  (overview|reviews|semantics|improvements)
   Monitor reviews, sentiment & AI insights.

   REAL: review text + rating distribution (POST /reviews).
   MOCK: sentiment / semantics / improvements (typed + labelled).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Review } from "@kittie/types";
import type { Theme } from "../../lib/theme";
import {
  fetchReviews,
  syncReviews,
  getMonitored,
  addMonitored,
  removeMonitored,
  type MonitoredApp,
  type ReviewSyncResult,
} from "../../lib/api/reviews";
import { enrichReviews } from "../../lib/api/reviewIntel";
import { PageHeader, Tabs, EmptyState, type TabDef } from "../../components/reviews/primitives";
import { AppPicker } from "../../components/reviews/AppPicker";
import { SyncProgress } from "../../components/reviews/SyncProgress";
import { OverviewTab, ReviewsTab, SemanticsTab, ImprovementsTab } from "./reviewTabs";
import { formatCompact } from "../../lib/format";
import {
  IconStar, IconSun, IconMoon, IconInfo, IconClose, IconSearch,
  IconChart, IconSpark, IconUsers, IconGrid,
} from "../../icons";

/** Sentinel id for the cross-app rollup entry in the rail. */
const ALL_APPS = "__all__";

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <IconChart style={{ width: 14, height: 14 }} /> },
  { id: "reviews", label: "Reviews", icon: <IconUsers style={{ width: 14, height: 14 }} /> },
  { id: "semantics", label: "Semantics", icon: <IconSearch style={{ width: 14, height: 14 }} /> },
  { id: "improvements", label: "Improvements", icon: <IconSpark style={{ width: 14, height: 14 }} /> },
];
const VALID = new Set(TABS.map((t) => t.id));

export function ReviewsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { tab } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const activeTab = tab && VALID.has(tab) ? tab : "overview";

  const [monitored, setMonitoredState] = useState<MonitoredApp[]>(() => getMonitored());
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<MonitoredApp | null>(null); // 5-stage sync modal
  const [howto, setHowto] = useState(false);

  // selected app: ?app=id (incl. the All-Apps sentinel), else first monitored
  const selectedId = sp.get("app") || monitored[0]?.id || null;
  const isAll = selectedId === ALL_APPS && monitored.length > 0;
  const selected = isAll ? null : (monitored.find((a) => a.id === selectedId) || monitored[0] || null);
  const monitoredKey = monitored.map((a) => a.id).join(","); // stable dep for the rollup

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0); // bumped to re-read from DB
  const [syncing, setSyncing] = useState(false);   // live pull in flight

  // load reviews — one app, or the union of all monitored apps (rollup)
  useEffect(() => {
    if (isAll) {
      if (monitored.length === 0) { setReviews([]); return; }
      const ac = new AbortController();
      setLoading(true);
      setError(null);
      Promise.all(
        monitored.map((a) =>
          fetchReviews(a.id, { limit: 500 }, ac.signal).then((r) => r.data).catch(() => []),
        ),
      )
        .then((lists) => !ac.signal.aborted && setReviews(lists.flat()))
        .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load reviews"))
        .finally(() => !ac.signal.aborted && setLoading(false));
      return () => ac.abort();
    }
    if (!selected) { setReviews([]); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchReviews(selected.id, { limit: 500 }, ac.signal)
      .then((res) => !ac.signal.aborted && setReviews(res.data))
      .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load reviews"))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [isAll, selected?.id, monitoredKey, reloadTick]);

  // Refresh = live pull from the store, then re-read from the DB. For the
  // rollup, sync every monitored app (sequential — polite to the stores).
  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      if (isAll) {
        for (const a of monitored) {
          try { await syncReviews(a.id); } catch { /* keep going */ }
        }
      } else if (selectedId) {
        await syncReviews(selectedId);
      }
    } catch {
      /* surface nothing — re-read anyway so any partial pull shows */
    } finally {
      setSyncing(false);
      setReloadTick((t) => t + 1);
    }
  }, [isAll, selectedId, monitoredKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tagged = useMemo(() => enrichReviews(reviews), [reviews]);

  const setTab = useCallback((id: string) => {
    const qs = sp.toString();
    navigate(`/reviews/${id}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [navigate, sp]);

  const selectApp = useCallback((id: string) => {
    const next = new URLSearchParams(sp);
    next.set("app", id);
    setSp(next, { replace: true });
  }, [sp, setSp]);

  // Pick → close picker → open the 5-stage sync modal. The app is registered
  // on the stream's `done`, then the user lands on its populated tabs.
  function handleAdd(app: MonitoredApp) {
    setPicking(false);
    setAdding(app);
  }

  function handleSynced(app: MonitoredApp, _result: ReviewSyncResult) {
    const next = addMonitored(app);
    setMonitoredState(next);
    selectApp(app.id);
    setReloadTick((t) => t + 1); // re-read so the freshly-synced reviews show
  }

  function handleRemove(id: string) {
    const next = removeMonitored(id);
    setMonitoredState(next);
    if (selectedId === id) {
      const fallback = next[0]?.id;
      const params = new URLSearchParams(sp);
      if (fallback) params.set("app", fallback); else params.delete("app");
      setSp(params, { replace: true });
    }
  }

  return (
    <main className="main">
      <PageHeader
        icon={<IconStar style={{ width: 18, height: 18 }} />}
        title="Reviews"
        subtitle="Monitor reviews, sentiment & AI insights across your apps"
        actions={
          <>
            <button className="btn" onClick={() => setHowto((v) => !v)}>
              <IconInfo /> How it works
            </button>
            <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </>
        }
      />

      {howto && <HowItWorks onClose={() => setHowto(false)} />}

      <div className="rv-layout">
        {/* monitoring rail */}
        <aside className="rv-rail">
          <div className="rv-rail-head">
            <span className="rv-rail-title">Monitored apps</span>
            <button className="rv-add-btn" onClick={() => setPicking(true)}>+ Add</button>
          </div>
          {monitored.length === 0 ? (
            <div className="rv-rail-empty">No apps yet</div>
          ) : (
            <ul className="rv-rail-list">
              {monitored.length > 1 && (
                <li className="rv-rail-li" key={ALL_APPS}>
                  <button
                    className={`rv-rail-item rv-rail-all ${isAll ? "on" : ""}`}
                    onClick={() => selectApp(ALL_APPS)}
                  >
                    <div className="app-icon placeholder rv-rail-all-icon"><IconGrid style={{ width: 16, height: 16 }} /></div>
                    <div className="rv-rail-meta">
                      <div className="rv-rail-name">All apps</div>
                      <div className="rv-rail-sub">{monitored.length} apps combined</div>
                    </div>
                  </button>
                </li>
              )}
              {monitored.map((a) => (
                <li className="rv-rail-li" key={a.id}>
                  <button
                    className={`rv-rail-item ${selected?.id === a.id ? "on" : ""}`}
                    onClick={() => selectApp(a.id)}
                  >
                    {a.iconUrl ? (
                      <img className="app-icon" src={a.iconUrl} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="app-icon placeholder">{a.title.charAt(0)}</div>
                    )}
                    <div className="rv-rail-meta">
                      <div className="rv-rail-name">{a.title}</div>
                      <div className="rv-rail-sub">{formatCompact(a.reviewCount)} reviews</div>
                    </div>
                  </button>
                  <button
                    className="rv-rail-x"
                    aria-label={`Stop monitoring ${a.title}`}
                    title={`Stop monitoring ${a.title}`}
                    onClick={() => handleRemove(a.id)}
                  >
                    <IconClose style={{ width: 13, height: 13 }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* content */}
        <section className="rv-content">
          {monitored.length === 0 ? (
            <EmptyState
              icon={<IconStar style={{ width: 30, height: 30 }} />}
              title="No apps monitored yet"
              sub="Add your first app to start tracking its reviews, sentiment and AI-surfaced improvement ideas."
              action={<button className="btn btn-accent" onClick={() => setPicking(true)}>Add your first app</button>}
            />
          ) : (
            <>
              <div className="rv-selected">
                {isAll ? (
                  <>
                    <div className="app-icon placeholder rv-rail-all-icon" style={{ width: 40, height: 40, borderRadius: 11 }}>
                      <IconGrid style={{ width: 20, height: 20 }} />
                    </div>
                    <div>
                      <div className="rv-selected-name">All apps</div>
                      <div className="rv-selected-dev">Combined across {monitored.length} monitored apps</div>
                    </div>
                  </>
                ) : selected ? (
                  <>
                    {selected.iconUrl ? (
                      <img className="app-icon" style={{ width: 40, height: 40, borderRadius: 11 }} src={selected.iconUrl} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="app-icon placeholder" style={{ width: 40, height: 40, borderRadius: 11 }}>{selected.title.charAt(0)}</div>
                    )}
                    <div>
                      <div className="rv-selected-name">{selected.title}</div>
                      <div className="rv-selected-dev">{selected.developer}</div>
                    </div>
                  </>
                ) : null}
              </div>

              <Tabs tabs={TABS} active={activeTab} onChange={setTab} />

              <div className="rv-panel">
                {error ? (
                  <EmptyState icon={<IconInfo />} title="Couldn’t load reviews" sub={error} />
                ) : loading ? (
                  <ReviewsSkeleton />
                ) : activeTab === "overview" ? (
                  <OverviewTab tagged={tagged} appsMonitored={monitored.length} />
                ) : activeTab === "reviews" ? (
                  <ReviewsTab tagged={tagged} />
                ) : activeTab === "semantics" ? (
                  <SemanticsTab tagged={tagged} onRefresh={refresh} refreshing={syncing || loading} />
                ) : (
                  <ImprovementsTab tagged={tagged} onRefresh={refresh} refreshing={syncing || loading} />
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {picking && (
        <AppPicker
          existingIds={new Set(monitored.map((a) => a.id))}
          onAdd={handleAdd}
          onClose={() => setPicking(false)}
        />
      )}

      {adding && (
        <SyncProgress
          app={adding}
          onComplete={handleSynced}
          onClose={() => setAdding(null)}
        />
      )}
    </main>
  );
}

function HowItWorks({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: 1, t: "Written reviews only", d: "Only reviews with a written comment are indexed — rating-only reviews are skipped." },
    { n: 2, t: "Latest 500 on add, then daily", d: "Adding a new app initially indexes the latest 500 reviews. After that, every new review is picked up automatically each day." },
    { n: 3, t: "AI-analysed", d: "Each review is analysed by AI for sentiment, semantic topics and improvement areas." },
    { n: 4, t: "Refresh any time", d: "Hit Refresh to manually fetch the latest reviews at any time." },
  ];
  return (
    <div className="rv-howto">
      <button className="rv-howto-close" onClick={onClose} aria-label="Dismiss"><IconClose style={{ width: 14, height: 14 }} /></button>
      <div className="rv-howto-title">How review monitoring works</div>
      <p className="rv-howto-intro">Reviews aren’t fully historical by default — here’s what gets indexed and when to refresh.</p>
      <div className="rv-howto-steps">
        {steps.map((s) => (
          <div className="rv-howto-step" key={s.n}>
            <span className="rv-howto-num">{s.n}</span>
            <div>
              <div className="rv-howto-step-t">{s.t}</div>
              <div className="rv-howto-step-d">{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewsSkeleton() {
  return (
    <div className="rv-grid-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rv-card">
          <div className="skel" style={{ width: "45%", height: 14, marginBottom: 16 }} />
          <div className="skel" style={{ width: "60%", height: 38, marginBottom: 16 }} />
          {Array.from({ length: 5 }).map((__, j) => (
            <div key={j} className="skel" style={{ height: 14, marginBottom: 10 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

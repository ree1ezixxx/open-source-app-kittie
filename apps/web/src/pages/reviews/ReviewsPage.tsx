/* ============================================================
   Lane D — Reviews page. /reviews/:tab  (overview|feed|semantics|improvements)
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
  fetchReviewCounts,
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
import { AppSelector } from "../../components/reviews/AppSelector";
import { SyncProgress } from "../../components/reviews/SyncProgress";
import { OverviewTab, ReviewsTab, SemanticsTab, ImprovementsTab } from "./reviewTabs";
import {
  IconStar, IconSun, IconMoon, IconInfo, IconSearch, IconRefresh, IconClose,
  IconChart, IconSpark, IconUsers, IconMessage,
} from "../../icons";

/** Sentinel id for the cross-app rollup entry in the rail. */
const ALL_APPS = "__all__";

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <IconChart style={{ width: 14, height: 14 }} /> },
  { id: "feed", label: "Reviews", icon: <IconUsers style={{ width: 14, height: 14 }} /> },
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
  const [busyId, setBusyId] = useState<string | null>(null); // per-app refresh in the selector
  const [indexed, setIndexed] = useState<Record<string, number>>({}); // real indexed counts per app

  // Indexed review counts for the rail — what we actually hold, not the store's
  // listing total. Refreshes when the monitored set or data changes.
  useEffect(() => {
    if (monitored.length === 0) { setIndexed({}); return; }
    const ac = new AbortController();
    fetchReviewCounts(monitored.map((a) => a.id), ac.signal)
      .then((c) => !ac.signal.aborted && setIndexed(c))
      .catch(() => { /* non-fatal — rail just falls back to a dash */ });
    return () => ac.abort();
  }, [monitoredKey, reloadTick]);

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

  // Per-app refresh from the selector dropdown — sync one app, then re-read.
  const refreshApp = useCallback(async (id: string) => {
    setBusyId(id);
    try { await syncReviews(id); } catch { /* re-read anyway */ }
    finally { setBusyId(null); setReloadTick((t) => t + 1); }
  }, []);

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
    <main className="main rv-page">
      <PageHeader
        icon={<IconMessage style={{ width: 18, height: 18 }} />}
        title="Reviews"
        subtitle="Monitor reviews, sentiment & AI insights across your apps"
        actions={
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        }
      />

      {/* truth: lime info pill below the header (not a header action) */}
      <button
        className={`rv-howto-pill ${howto ? "on" : ""}`}
        onClick={() => setHowto((v) => !v)}
        aria-expanded={howto}
      >
        <IconInfo style={{ width: 14, height: 14 }} /> How review monitoring works
      </button>

      {howto && <HowItWorks onClose={() => setHowto(false)} />}

      <Tabs tabs={TABS} active={activeTab} onChange={setTab} />

      {/* app selector (truth: "All Apps {N}" dropdown) + single-app Refresh */}
      <div className="rv-selector-row">
        <AppSelector
          monitored={monitored}
          selectedId={selectedId}
          isAll={isAll}
          allowAll={activeTab === "overview"}
          indexed={indexed}
          busyId={busyId}
          onSelect={selectApp}
          onRefreshApp={refreshApp}
          onRemoveApp={handleRemove}
          onAddApp={() => setPicking(true)}
        />
        {!isAll && selected && (
          <button
            className="btn rv-refresh-btn"
            onClick={refresh}
            disabled={syncing}
            title="Fetch latest reviews for this app"
          >
            <IconRefresh className={syncing ? "rv-spin" : ""} /> Refresh
          </button>
        )}
      </div>

      <div className="rv-panel">
        {monitored.length === 0 ? (
          <EmptyState
            icon={<IconStar style={{ width: 30, height: 30 }} />}
            title="No apps monitored yet"
            sub="Add your first app to start monitoring reviews, sentiment, and get AI-powered insights."
          />
        ) : activeTab !== "overview" && isAll ? (
          // All-Apps is Overview-only (truth) — the data tabs need a specific app
          <EmptyState
            icon={<IconStar style={{ width: 30, height: 30 }} />}
            title="Select an app"
            sub={
              activeTab === "semantics"
                ? "Choose an app from the selector above to view its topic analysis."
                : activeTab === "improvements"
                  ? "Choose an app from the selector above to view its improvement areas."
                  : "Choose an app from the selector above to view its reviews."
            }
          />
        ) : error ? (
          <EmptyState icon={<IconInfo />} title="Couldn’t load reviews" sub={error} />
        ) : loading ? (
          <ReviewsSkeleton />
        ) : activeTab === "overview" ? (
          <OverviewTab
            tagged={tagged}
            appsMonitored={monitored.length}
            isAll={isAll}
            monitored={monitored}
            indexed={indexed}
            appName={selected?.title ?? null}
            onSelectApp={selectApp}
            onViewReviews={() => setTab("feed")}
          />
        ) : activeTab === "feed" ? (
          <ReviewsTab tagged={tagged} />
        ) : activeTab === "semantics" ? (
          <SemanticsTab tagged={tagged} onRefresh={refresh} refreshing={syncing || loading} />
        ) : (
          <ImprovementsTab tagged={tagged} onRefresh={refresh} refreshing={syncing || loading} />
        )}
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

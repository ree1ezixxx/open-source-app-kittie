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
  getReviewInsights,
  getMonitored,
  addMonitored,
  removeMonitored,
  type MonitoredApp,
  type ReviewInsights,
} from "../../lib/api/reviews";
import { PageHeader, Tabs, EmptyState, type TabDef } from "../../components/reviews/primitives";
import { AppPicker } from "../../components/reviews/AppPicker";
import { OverviewTab, ReviewsTab, SemanticsTab, ImprovementsTab } from "./reviewTabs";
import { formatCompact } from "../../lib/format";
import {
  IconStar, IconSun, IconMoon, IconInfo, IconClose, IconSearch,
  IconChart, IconSpark, IconUsers,
} from "../../icons";

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
  const [howto, setHowto] = useState(false);

  // selected app: ?app=id, else first monitored
  const selectedId = sp.get("app") || monitored[0]?.id || null;
  const selected = monitored.find((a) => a.id === selectedId) || monitored[0] || null;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load reviews for selected app
  useEffect(() => {
    if (!selected) { setReviews([]); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchReviews(selected.id, { limit: 100 }, ac.signal)
      .then((res) => !ac.signal.aborted && setReviews(res.data))
      .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load reviews"))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [selected?.id]);

  const insights: ReviewInsights = useMemo(() => getReviewInsights(reviews), [reviews]);

  const setTab = useCallback((id: string) => {
    const qs = sp.toString();
    navigate(`/reviews/${id}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [navigate, sp]);

  const selectApp = useCallback((id: string) => {
    const next = new URLSearchParams(sp);
    next.set("app", id);
    setSp(next, { replace: true });
  }, [sp, setSp]);

  function handleAdd(app: MonitoredApp) {
    const next = addMonitored(app);
    setMonitoredState(next);
    selectApp(app.id);
    setPicking(false);
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
        subtitle="Monitor reviews, sentiment & AI insights"
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
              {monitored.map((a) => (
                <li key={a.id}>
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
                    <span
                      className="rv-rail-x"
                      role="button"
                      aria-label={`Stop monitoring ${a.title}`}
                      onClick={(e) => { e.stopPropagation(); handleRemove(a.id); }}
                    >
                      <IconClose style={{ width: 13, height: 13 }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* content */}
        <section className="rv-content">
          {!selected ? (
            <EmptyState
              icon={<IconStar style={{ width: 30, height: 30 }} />}
              title="No apps monitored yet"
              sub="Add your first app to start tracking its reviews, sentiment and AI-surfaced improvement ideas."
              action={<button className="btn btn-accent" onClick={() => setPicking(true)}>Add your first app</button>}
            />
          ) : (
            <>
              <div className="rv-selected">
                {selected.iconUrl ? (
                  <img className="app-icon" style={{ width: 40, height: 40, borderRadius: 11 }} src={selected.iconUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="app-icon placeholder" style={{ width: 40, height: 40, borderRadius: 11 }}>{selected.title.charAt(0)}</div>
                )}
                <div>
                  <div className="rv-selected-name">{selected.title}</div>
                  <div className="rv-selected-dev">{selected.developer}</div>
                </div>
              </div>

              <Tabs tabs={TABS} active={activeTab} onChange={setTab} />

              <div className="rv-panel">
                {error ? (
                  <EmptyState icon={<IconInfo />} title="Couldn’t load reviews" sub={error} />
                ) : loading ? (
                  <ReviewsSkeleton />
                ) : activeTab === "overview" ? (
                  <OverviewTab reviews={reviews} insights={insights} />
                ) : activeTab === "reviews" ? (
                  <ReviewsTab reviews={reviews} />
                ) : activeTab === "semantics" ? (
                  <SemanticsTab insights={insights} />
                ) : (
                  <ImprovementsTab insights={insights} />
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
    </main>
  );
}

function HowItWorks({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: 1, t: "Add apps to monitor", d: "Pick any app in the database. We track its public review stream per store and country." },
    { n: 2, t: "Read the real reviews", d: "The Overview and Reviews tabs render live review text — titles, bodies, ratings, dates — filterable by rating and recency." },
    { n: 3, t: "Surface AI insights", d: "Sentiment, semantic themes and improvement ideas roll up the noise. These are labelled previews until the analysis backend ships." },
  ];
  return (
    <div className="rv-howto">
      <button className="rv-howto-close" onClick={onClose} aria-label="Dismiss"><IconClose style={{ width: 14, height: 14 }} /></button>
      <div className="rv-howto-title">How review monitoring works</div>
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

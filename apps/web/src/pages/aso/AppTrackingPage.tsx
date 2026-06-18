import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppListItem, Store } from "@kittie/types";
import { IconChart, IconClose, IconInfo, IconMoon, IconRank, IconSearch, IconSpark, IconSun } from "../../icons";
import { IconCheck, IconPlus, IconTrash } from "../../components/aso/icons";
import { AppAvatar, Meter, OpportunityBadge, StorePill } from "../../components/aso/KeywordBits";
import { listApps } from "../../lib/api";
import {
  compareKeywords,
  fetchTrackedApps,
  trackApp as trackAppApi,
  untrackApp as untrackAppApi,
  type KeywordDifficulty,
  type TrackedApp,
} from "../../lib/api/keywords";
import { relativeTime } from "../../lib/format";
import type { Theme } from "../../lib/theme";
import "../../styles/aso.css";

const STOPWORDS = new Set(["the", "and", "for", "with", "app", "apps", "your", "free", "pro", "plus", "lite", "ios", "android"]);

/** Candidate keywords to size up for a single app — category + title tokens/bigrams. */
function candidateKeywords(app: TrackedApp): string[] {
  const out: string[] = [];
  if (app.category) {
    const c = app.category.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (c) out.push(c);
  }
  const tokens = app.title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  out.push(...tokens);
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t) ? false : (seen.add(t), true))).slice(0, 8);
}

export function AppTrackingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const navigate = useNavigate();
  const [tracked, setTracked] = useState<TrackedApp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AppListItem[]>([]);
  const [searching, setSearching] = useState(false);
  // Per-app tracked-keyword selection — UI-only this slice; server-side
  // keyword persistence lands in #23. Keyed by tracked-app id.
  const [trackedKeywords, setTrackedKeywords] = useState<Record<string, string[]>>({});

  const [opps, setOpps] = useState<KeywordDifficulty[]>([]);
  const [oppLoading, setOppLoading] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);

  // Load the server-persisted tracked apps (survives reload).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchTrackedApps(ctrl.signal).then(setTracked).catch(() => {});
    return () => ctrl.abort();
  }, []);

  const selected = tracked.find((t) => t.appId === selectedId) ?? null;
  const selectedKeywords = selected ? (trackedKeywords[selected.id] ?? []) : [];

  // debounced app search for the Add picker
  useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      listApps({ search: q, limit: 8 }, ctrl.signal)
        .then((res) => setSearchResults(res.data))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 260);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, adding]);

  // load live keyword opportunities for the selected app
  const loadOpps = useCallback((app: TrackedApp, signal: AbortSignal) => {
    const terms = candidateKeywords(app);
    if (terms.length === 0) { setOpps([]); return; }
    setOppLoading(true);
    setOppError(null);
    compareKeywords(terms.map((keyword) => ({ keyword, store: app.store })), "US", signal)
      .then((data) => { if (!signal.aborted) setOpps(data); })
      .catch((e) => { if (!signal.aborted) setOppError(e instanceof Error ? e.message : "Failed to load opportunities"); })
      .finally(() => { if (!signal.aborted) setOppLoading(false); });
  }, []);

  useEffect(() => {
    if (!selected) { setOpps([]); return; }
    const ctrl = new AbortController();
    loadOpps(selected, ctrl.signal);
    return () => ctrl.abort();
    // Key off selected?.id, not selectedId: after addApp sets selectedId the tracked
    // list refreshes a tick later, so selected goes null→row without selectedId changing.
    // Keying on selectedId alone left the opportunities panel blank after every add.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function addApp(a: AppListItem) {
    // Already tracked → just select it (server add is idempotent regardless).
    if (tracked.some((t) => t.appId === a.id)) {
      setSelectedId(a.id); setAdding(false); setQuery(""); return;
    }
    setAdding(false);
    setQuery("");
    setSelectedId(a.id);
    try {
      await trackAppApi(a.id, "US");
      const fresh = await fetchTrackedApps();
      setTracked(fresh);
    } catch {
      /* leave list as-is on failure; the empty/select states stay coherent */
    }
  }

  async function untrack(appId: string, store: Store) {
    setTracked((prev) => prev.filter((t) => t.appId !== appId));
    if (selectedId === appId) setSelectedId(null);
    try {
      await untrackAppApi(appId, store, "US");
    } catch {
      // Re-sync from the server so the UI reflects the true persisted state.
      fetchTrackedApps().then(setTracked).catch(() => {});
    }
  }

  function toggleKeyword(rowId: string, kw: string) {
    setTrackedKeywords((prev) => {
      const cur = prev[rowId] ?? [];
      const next = cur.includes(kw) ? cur.filter((k) => k !== kw) : [...cur, kw];
      return { ...prev, [rowId]: next };
    });
  }

  return (
    <main className="main">
      <div className="topbar">
        <div className="topbar-row">
          <div className="page-title-wrap">
            <div className="page-icon"><IconChart style={{ width: 18, height: 18 }} /></div>
            <div>
              <div className="page-title">App Keyword Tracking</div>
              <div className="page-sub">Track your apps and surface their keyword openings</div>
            </div>
            {tracked.length > 0 && <span className="count-chip">{tracked.length}</span>}
          </div>
          <div className="topbar-spacer" />
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>

      <div className="aso-split">
        {/* left — Your Apps */}
        <div className="aso-list">
          <div className="track-head">
            <span className="label">Your Apps</span>
            <button className="btn btn-accent" onClick={() => setAdding((v) => !v)}>
              {adding ? <><IconClose /> Close</> : <><IconPlus /> Add</>}
            </button>
          </div>

          {adding && (
            <div className="track-add-panel">
              <div className="search">
                <IconSearch />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search apps to track…" spellCheck={false} />
              </div>
              <div className="track-add-results">
                {searching && <div className="meter-label" style={{ padding: "8px" }}>Searching…</div>}
                {!searching && query.trim() && searchResults.length === 0 && (
                  <div className="meter-label" style={{ padding: "8px" }}>No apps found.</div>
                )}
                {searchResults.map((a) => (
                  <button key={a.id} className="track-result" onClick={() => addApp(a)}>
                    <AppAvatar title={a.title} iconUrl={a.iconUrl} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{a.title}</div>
                      <div className="s">{a.developer}</div>
                    </div>
                    <IconPlus className="add-mark" style={{ width: 15, height: 15 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tracked.length === 0 && !adding && (
            <div className="aso-empty" style={{ marginTop: 8 }}>
              <IconChart />
              <div className="t">No apps tracked yet</div>
              <div className="s">Add an app to track its keyword rankings and surface ranking opportunities.</div>
              <button className="btn btn-accent" style={{ marginTop: 4 }} onClick={() => setAdding(true)}><IconPlus /> Add an app</button>
            </div>
          )}

          {tracked.map((t) => {
            const kwCount = trackedKeywords[t.id]?.length ?? 0;
            return (
              <button key={t.id} className={`track-app ${t.appId === selectedId ? "active" : ""}`} onClick={() => setSelectedId(t.appId)}>
                <AppAvatar title={t.title} iconUrl={t.iconUrl} />
                <div className="meta">
                  <div className="title">{t.title}</div>
                  <div className="sub">
                    <span className="flag">🇺🇸</span>
                    <span>{kwCount} {kwCount === 1 ? "keyword" : "keywords"}</span>
                    <span>·</span>
                    <span>{relativeTime(t.addedAt)}</span>
                  </div>
                </div>
                <span className="track-untrack" role="button" aria-label="Untrack" onClick={(e) => { e.stopPropagation(); untrack(t.appId, t.store); }}>
                  <IconTrash />
                </span>
              </button>
            );
          })}
        </div>

        {/* right — detail */}
        <div className="aso-detail">
          {!selected ? (
            <div className="aso-placeholder">
              <IconChart />
              <div className="t">Select an app</div>
              <div className="s">Pick a tracked app to see its keyword rankings and ranking opportunities.</div>
            </div>
          ) : (
            <div className="aso-detail-inner">
              <div className="track-detail-head">
                <AppAvatar title={selected.title} iconUrl={selected.iconUrl} />
                <div style={{ minWidth: 0 }}>
                  <div className="name">{selected.title}</div>
                  <div className="dev">{selected.developer}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <StorePill store={selected.store} />
                  <span className="flag" title="United States">🇺🇸</span>
                </div>
              </div>

              {/* keyword rankings — honest empty state (keyword_rankings table is empty) */}
              <div className="section-label">Keyword rankings</div>
              <div className="aso-empty">
                <IconRank />
                <div className="t">No rank history yet</div>
                <div className="s">Keyword rank tracking populates once daily store snapshots begin. Track keywords below to start building a baseline.</div>
              </div>

              {/* live opportunity panel */}
              <div className="section-head" style={{ margin: "30px 0 11px" }}>
                <div className="section-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                  <IconSpark style={{ width: 13, height: 13, color: "var(--accent)" }} /> Keyword opportunities
                </div>
                <span className="section-count">{selectedKeywords.length} tracked</span>
              </div>

              {oppError && (
                <div className="notice" style={{ marginBottom: 12 }}>
                  <IconInfo /> {oppError}. Start the API server and retry.
                </div>
              )}

              {oppLoading ? (
                <div className="opp-list">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 56, borderRadius: 12 }} />)}
                </div>
              ) : opps.length === 0 && !oppError ? (
                <div className="aso-empty">
                  <IconSearch />
                  <div className="t">No opportunities surfaced</div>
                  <div className="s">We couldn't derive candidate keywords for this app.</div>
                </div>
              ) : (
                <div className="opp-list">
                  {opps.map((kd) => {
                    const isTracked = selectedKeywords.includes(kd.keyword);
                    return (
                      <div key={kd.keyword} className="opp-row">
                        <span
                          className="kw"
                          role="button"
                          title="Open in Keyword Workspace"
                          onClick={() => navigate(`/dashboard/aso/keywords?q=${encodeURIComponent(kd.keyword)}`)}
                          style={{ cursor: "pointer" }}
                        >
                          {kd.keyword}
                        </span>
                        <Meter kind="difficulty" label="Difficulty" value={kd.difficulty} />
                        <Meter kind="popularity" label="Popularity" value={kd.popularity} />
                        <OpportunityBadge score={kd.opportunityScore} />
                        <button className={`track-btn ${isTracked ? "on" : ""}`} onClick={() => toggleKeyword(selected.id, kd.keyword)}>
                          {isTracked ? <><IconCheck /> Tracked</> : <><IconPlus /> Track</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

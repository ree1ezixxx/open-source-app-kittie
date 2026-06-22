import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppListItem, Store } from "@kittie/types";
import { IconChart, IconChevron, IconClose, IconExternal, IconInfo, IconMoon, IconRank, IconRefresh, IconSearch, IconSpark, IconSun } from "../../icons";
import { IconCheck, IconPlus, IconTrash } from "../../components/aso/icons";
import { AppAvatar, Meter, OpportunityBadge, StorePill } from "../../components/aso/KeywordBits";
import { listApps } from "../../lib/api";
import {
  compareKeywords,
  fetchTrackedAppRankings,
  fetchTrackedApps,
  streamTrackApp,
  streamTrackedAppRankings,
  trackApp as trackAppApi,
  untrackApp as untrackAppApi,
  type KeywordDifficulty,
  type TrackedApp,
  type TrackedAppKeywordRanking,
  type TrackedAppProgressEvent,
  type TrackedAppSyncDone,
} from "../../lib/api/keywords";
import { relativeTime } from "../../lib/format";
import { MARKET_COUNT, MARKETS, market } from "../../lib/markets";
import type { Theme } from "../../lib/theme";
import "../../styles/aso.css";

const STOPWORDS = new Set(["the", "and", "for", "with", "app", "apps", "your", "free", "pro", "plus", "lite", "ios", "android"]);
type RankSort = "position" | "popularity" | "difficulty";
type SortDir = "asc" | "desc";
type SyncMode = "add" | "refresh";

interface TrackingProgress extends TrackedAppProgressEvent {
  mode: SyncMode;
  title: string;
  minimized: boolean;
  complete?: boolean;
  error?: string;
}

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

function compareRankValue(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function RankingAppsStack({ apps }: { apps: TrackedAppKeywordRanking["topApps"] }) {
  const visible = apps.slice(0, 5);
  if (visible.length === 0) return <span className="kw-appstack-empty">None</span>;
  return (
    <div className="kw-appstack" title={visible.map((a) => `#${a.rank} ${a.title}`).join("\n")}>
      {visible.map((a) => (
        <span className="kw-appstack-icon" key={`${a.rank}-${a.title}`}>
          {a.iconUrl ? <img src={a.iconUrl} alt="" /> : a.title.slice(0, 1)}
        </span>
      ))}
      <span className="kw-appstack-count">{apps.length}</span>
    </div>
  );
}

function mergeProgress(
  current: TrackingProgress | null,
  event: TrackedAppProgressEvent,
): TrackingProgress | null {
  if (!current) return null;
  return {
    ...current,
    ...event,
    doneMarkets: event.doneMarkets ?? current.doneMarkets,
    totalMarkets: event.totalMarkets ?? current.totalMarkets,
    synced: event.synced ?? current.synced,
    failed: event.failed ?? current.failed,
  };
}

function ProgressModal({
  progress,
  onMinimize,
  onRestore,
  onDismiss,
}: {
  progress: TrackingProgress;
  onMinimize: () => void;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  const total = progress.totalMarkets ?? MARKET_COUNT;
  const done = progress.doneMarkets ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const current = progress.country ? market(progress.country) : null;
  const title = progress.mode === "add" ? "Adding app" : "Refreshing rankings";

  if (progress.minimized) {
    return (
      <button className="track-sync-mini" onClick={onRestore} title="Show progress">
        <span className={`sync-dot ${progress.complete ? "done" : progress.error ? "error" : ""}`} />
        <span>{progress.complete ? "Analysis complete" : `${done}/${total} markets`}</span>
      </button>
    );
  }

  return (
    <div className="track-sync-overlay" role="dialog" aria-modal="false" aria-label={title}>
      <div className="track-sync-modal">
        <div className="track-sync-head">
          <div>
            <div className="track-sync-kicker">{title}</div>
            <div className="track-sync-title">{progress.title}</div>
          </div>
          <button className="icon-btn" onClick={onMinimize} title="Minimize">
            <IconChevron style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <div className="track-sync-stage">
          <span>{progress.label}</span>
          <span>{progress.complete ? "Done" : `${pct}%`}</span>
        </div>
        <div className="track-sync-bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="track-sync-meta">
          <span>{done}/{total} markets</span>
          {current && <span>{current.flag} {current.name}</span>}
          <span>{progress.synced ?? 0} synced</span>
          {(progress.failed ?? 0) > 0 && <span>{progress.failed} failed</span>}
        </div>
        {progress.error && <div className="track-sync-error">{progress.error}</div>}
        {progress.complete && (
          <button className="btn btn-accent track-sync-done" onClick={onDismiss}>
            <IconCheck /> Done
          </button>
        )}
      </div>
    </div>
  );
}

export function AppTrackingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const navigate = useNavigate();
  const syncCancel = useRef<(() => void) | null>(null);
  const [tracked, setTracked] = useState<TrackedApp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AppListItem[]>([]);
  const [searching, setSearching] = useState(false);
  // Per-app manual keyword selection is UI-only until rank tracking lands.
  // Generated keyword counts come from the server-persisted tracked app row.
  const [trackedKeywords, setTrackedKeywords] = useState<Record<string, string[]>>({});

  const [opps, setOpps] = useState<KeywordDifficulty[]>([]);
  const [oppLoading, setOppLoading] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<TrackedAppKeywordRanking[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [rankSearch, setRankSearch] = useState("");
  const [rankSort, setRankSort] = useState<RankSort>("position");
  const [rankDir, setRankDir] = useState<SortDir>("asc");
  const [rankCountry, setRankCountry] = useState("US");
  const [progress, setProgress] = useState<TrackingProgress | null>(null);

  useEffect(() => () => syncCancel.current?.(), []);

  // Load the server-persisted tracked apps (survives reload).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchTrackedApps(ctrl.signal).then(setTracked).catch(() => {});
    return () => ctrl.abort();
  }, []);

  const selected = tracked.find((t) => t.appId === selectedId) ?? null;
  const selectedKeywords = selected ? (trackedKeywords[selected.id] ?? []) : [];

  const visibleRankings = useMemo(() => {
    const needle = rankSearch.trim().toLowerCase();
    const filtered = needle
      ? rankings.filter((row) => row.keyword.toLowerCase().includes(needle))
      : rankings;
    return [...filtered].sort((a, b) => {
      if (rankSort === "position") return compareRankValue(a.position, b.position, rankDir);
      if (rankSort === "popularity") return compareRankValue(a.popularity, b.popularity, rankDir);
      return compareRankValue(a.difficulty, b.difficulty, rankDir);
    });
  }, [rankDir, rankSearch, rankSort, rankings]);

  const rankSortLabel = rankDir === "asc" ? "↑" : "↓";

  function setRankingSort(next: RankSort) {
    if (rankSort === next) {
      setRankDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setRankSort(next);
    setRankDir(next === "position" ? "asc" : "desc");
  }

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

  const loadRankings = useCallback((app: TrackedApp, signal?: AbortSignal, refresh = false, country = rankCountry) => {
    setRankLoading(true);
    setRankError(null);
    setRankings([]);
    fetchTrackedAppRankings(app.id, signal, { refresh, country })
      .then((data) => { if (!signal?.aborted) setRankings(data); })
      .catch((e) => {
        if (!signal?.aborted) {
          setRankings([]);
          setRankError(e instanceof Error ? e.message : "Failed to load rankings");
        }
      })
      .finally(() => { if (!signal?.aborted) setRankLoading(false); });
  }, [rankCountry]);

  useEffect(() => {
    if (!selected) {
      setRankings([]);
      setRankSearch("");
      return;
    }
    const ctrl = new AbortController();
    loadRankings(selected, ctrl.signal, false, rankCountry);
    return () => ctrl.abort();
  }, [loadRankings, rankCountry, selected?.id]);

  function applySyncDone(done: TrackedAppSyncDone) {
    setTracked((prev) => {
      const without = prev.filter((t) => t.id !== done.tracked.id);
      return [done.tracked, ...without];
    });
    setSelectedId(done.tracked.appId);
    if (rankCountry === done.tracked.country) {
      setRankings(done.rankings);
      setRankLoading(false);
    } else {
      fetchTrackedAppRankings(done.tracked.id, undefined, { country: rankCountry })
        .then(setRankings)
        .catch((e) => setRankError(e instanceof Error ? e.message : "Failed to load rankings"))
        .finally(() => setRankLoading(false));
    }
    fetchTrackedApps().then(setTracked).catch(() => {});
  }

  function startAddSync(a: AppListItem) {
    syncCancel.current?.();
    setRankLoading(true);
    setRankError(null);
    setRankings([]);
    setProgress({
      mode: "add",
      title: a.title,
      stage: "validate_url",
      label: "Validate URL",
      doneMarkets: 0,
      totalMarkets: MARKET_COUNT,
      synced: 0,
      failed: 0,
      minimized: false,
    });
    syncCancel.current = streamTrackApp(a.id, "US", {
      onProgress: (event) => setProgress((prev) => mergeProgress(prev, event)),
      onDone: (done) => {
        applySyncDone(done);
        setProgress((prev) => prev ? {
          ...prev,
          stage: "done",
          label: "Done",
          doneMarkets: done.totalMarkets,
          totalMarkets: done.totalMarkets,
          synced: done.synced,
          failed: done.failed,
          complete: true,
        } : prev);
        syncCancel.current = null;
      },
      onError: (message) => {
        setRankLoading(false);
        setProgress((prev) => prev ? { ...prev, error: message, complete: true } : prev);
        syncCancel.current = null;
      },
    });
  }

  function startRefreshSync(app: TrackedApp) {
    syncCancel.current?.();
    setRankLoading(true);
    setRankError(null);
    setProgress({
      mode: "refresh",
      title: app.title,
      stage: "analyze_markets",
      label: "Analyze markets",
      doneMarkets: 0,
      totalMarkets: MARKET_COUNT,
      synced: 0,
      failed: 0,
      minimized: false,
    });
    syncCancel.current = streamTrackedAppRankings(app.id, {
      onProgress: (event) => setProgress((prev) => mergeProgress(prev, event)),
      onDone: (done) => {
        applySyncDone(done);
        setProgress((prev) => prev ? {
          ...prev,
          stage: "done",
          label: "Done",
          doneMarkets: done.totalMarkets,
          totalMarkets: done.totalMarkets,
          synced: done.synced,
          failed: done.failed,
          complete: true,
        } : prev);
        syncCancel.current = null;
      },
      onError: (message) => {
        setRankLoading(false);
        setProgress((prev) => prev ? { ...prev, error: message, complete: true } : prev);
        syncCancel.current = null;
      },
    });
  }

  async function addApp(a: AppListItem) {
    // Already tracked → select it, then hit the idempotent server add so a
    // prior generation failure can retry and a cache hit never spends again.
    const existing = tracked.find((t) => t.appId === a.id);
    if (existing) {
      setSelectedId(a.id);
      setAdding(false);
      setQuery("");
      try {
        const updated = await trackAppApi(a.id, "US");
        if (updated) {
          setTracked((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          startRefreshSync(updated);
        }
      } catch {
        /* selection still works; server retry can happen next add */
      }
      return;
    }
    setAdding(false);
    setQuery("");
    setSelectedId(a.id);
    startAddSync(a);
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
            const kwCount = t.generatedKeywordCount;
            return (
              <button key={t.id} className={`track-app ${t.appId === selectedId ? "active" : ""}`} onClick={() => setSelectedId(t.appId)}>
                <AppAvatar title={t.title} iconUrl={t.iconUrl} />
                <div className="meta">
                  <div className="title">{t.title}</div>
                  <div className="sub">
                    <span className="flag">{market(t.country).flag}</span>
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
                  <span className="flag" title={market(rankCountry).name}>{market(rankCountry).flag}</span>
                </div>
              </div>

              <div className="section-head" style={{ margin: "22px 0 11px" }}>
                <div className="section-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                  <IconRank style={{ width: 13, height: 13, color: "var(--accent)" }} /> Keyword rankings
                </div>
                <div className="kw-ideas-toolbar">
                  <div className="select market-select track-market-select" title="Market">
                    <select value={rankCountry} onChange={(e) => setRankCountry(e.target.value)} aria-label="Market">
                      {MARKETS.map((m) => (
                        <option key={m.code} value={m.code}>{m.flag} {m.code}</option>
                      ))}
                    </select>
                  </div>
                  <button className="kw-ideas-tool" onClick={() => startRefreshSync(selected)} title="Refresh all market rankings">
                    <IconRefresh style={{ width: 13, height: 13 }} /> Refresh
                  </button>
                </div>
              </div>

              {rankError && (
                <div className="notice" style={{ marginBottom: 12 }}>
                  <IconInfo /> {rankError}. Start the API server and retry.
                </div>
              )}

              {rankLoading ? (
                <div className="opp-list">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 46, borderRadius: 8 }} />)}
                </div>
              ) : rankings.length === 0 && !rankError ? (
                <div className="aso-empty">
                  <IconRank />
                  <div className="t">No generated keywords yet</div>
                  <div className="s">Add or refresh the app to sync live rankings across {MARKET_COUNT} markets.</div>
                </div>
              ) : (
                <>
                  <div className="search track-rank-search">
                    <IconSearch />
                    <input value={rankSearch} onChange={(e) => setRankSearch(e.target.value)} placeholder="Search keywords…" spellCheck={false} />
                  </div>
                  {visibleRankings.length === 0 ? (
                    <div className="aso-empty">
                      <IconSearch />
                      <div className="t">No matching keywords</div>
                      <div className="s">Clear the table search to see all generated rankings.</div>
                    </div>
                  ) : (
                    <div className="kw-ideas-scroll">
                      <table className="kw-ideas-table track-rank-table">
                        <thead>
                          <tr>
                            <th>Keyword</th>
                            <th className={`sortable ${rankSort === "position" ? "on" : ""}`} onClick={() => setRankingSort("position")}>
                              Position {rankSort === "position" ? rankSortLabel : ""}
                            </th>
                            <th className={`sortable ${rankSort === "popularity" ? "on" : ""}`} onClick={() => setRankingSort("popularity")}>
                              Popularity {rankSort === "popularity" ? rankSortLabel : ""}
                            </th>
                            <th className={`sortable ${rankSort === "difficulty" ? "on" : ""}`} onClick={() => setRankingSort("difficulty")}>
                              Difficulty {rankSort === "difficulty" ? rankSortLabel : ""}
                            </th>
                            <th className="kw-ideas-appshead">Ranking apps</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRankings.map((row) => (
                            <tr key={row.keywordId}>
                              <td>
                                <button className="kw-ideas-name" onClick={() => navigate(`/dashboard/aso/keywords?q=${encodeURIComponent(row.keyword)}`)}>
                                  {row.keyword}
                                </button>
                              </td>
                              <td className="num">{row.position == null ? "Not ranked" : `#${row.position}`}</td>
                              <td><Meter kind="popularity" label="Popularity" value={row.popularity ?? 0} /></td>
                              <td><Meter kind="difficulty" label="Difficulty" value={row.difficulty ?? 0} /></td>
                              <td><RankingAppsStack apps={row.topApps} /></td>
                              <td className="kw-ideas-action">
                                <button className="kw-ideas-expand" title="Open in Keyword Workspace" onClick={() => navigate(`/dashboard/aso/keywords?q=${encodeURIComponent(row.keyword)}`)}>
                                  <IconExternal />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

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
      {progress && (
        <ProgressModal
          progress={progress}
          onMinimize={() => setProgress((p) => p ? { ...p, minimized: true } : p)}
          onRestore={() => setProgress((p) => p ? { ...p, minimized: false } : p)}
          onDismiss={() => setProgress(null)}
        />
      )}
    </main>
  );
}

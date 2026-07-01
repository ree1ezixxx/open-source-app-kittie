import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppListItem, Store } from "@kittie/types";
import { IconApple, IconChart, IconChevron, IconClose, IconExternal, IconGooglePlay, IconInfo, IconMoon, IconRank, IconRefresh, IconSearch, IconSpark, IconStar, IconSun } from "../../icons";
import { IconCheck, IconPlus, IconTrash } from "../../components/aso/icons";
import { AppAvatar, Meter, OpportunityBadge, StorePill } from "../../components/aso/KeywordBits";
import { getApp, listApps } from "../../lib/api";
import {
  addTrackedAppKeyword,
  compareKeywords,
  fetchTrackedAppSimilarKeywords,
  fetchTrackedAppRankingsWithHistory,
  fetchTrackedApps,
  removeTrackedAppKeyword,
  streamTrackApp,
  streamTrackedAppRankings,
  trackApp as trackAppApi,
  untrackApp as untrackAppApi,
  type KeywordDifficulty,
  type TrackedAppPositionSeries,
  type TrackedApp,
  type TrackedAppKeywordRanking,
  type TrackedAppProgressEvent,
  type TrackedAppSyncDone,
} from "../../lib/api/keywords";
import { formatCompact, relativeTime } from "../../lib/format";
import { MARKET_COUNT, MARKETS, market } from "../../lib/markets";
import type { Theme } from "../../lib/theme";
import "../../styles/aso.css";

const STOPWORDS = new Set(["the", "and", "for", "with", "app", "apps", "your", "free", "pro", "plus", "lite", "ios", "android"]);
type RankSort = "position" | "popularity" | "difficulty";
type SortDir = "asc" | "desc";
type SyncMode = "add" | "refresh";
type DetailTab = "rankings" | "history" | "opportunities";
type AddMode = "search" | "url";
type AppCandidate = Pick<AppListItem, "id" | "title" | "developer" | "iconUrl" | "store" | "category" | "rating" | "reviewCount">;

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

function growthLabel(growth: number | null): string {
  if (growth == null) return "—";
  if (growth === 0) return "0";
  return growth > 0 ? `+${growth}` : `${growth}`;
}

function parseStoreUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/apps\.apple\.com|itunes\.apple\.com/.test(url)) {
    const match = url.match(/id(\d{4,})/);
    if (match) return `apple:${match[1]}`;
  }
  if (/play\.google\.com/.test(url)) {
    const match = url.match(/[?&]id=([\w.]+)/);
    if (match) return `google:${match[1]}`;
  }
  if (/^\d{6,}$/.test(url)) return `apple:${url}`;
  if (/^[a-z][\w.]+\.[\w.]+$/i.test(url)) return `google:${url}`;
  return null;
}

function GrowthBadge({ growth }: { growth: number | null }) {
  const kind = growth == null ? "empty" : growth > 0 ? "up" : growth < 0 ? "down" : "flat";
  return <span className={`rank-growth ${kind}`}>{growthLabel(growth)}</span>;
}

function PositionHistoryPanel({
  history,
  search,
  onOpenKeyword,
}: {
  history: TrackedAppPositionSeries[];
  search: string;
  onOpenKeyword: (keyword: string) => void;
}) {
  const needle = search.trim().toLowerCase();
  const visible = needle ? history.filter((row) => row.keyword.toLowerCase().includes(needle)) : history;

  if (visible.length === 0) {
    return (
      <div className="aso-empty">
        <IconChart />
        <div className="t">No position history</div>
        <div className="s">Run a ranking sync to start recording daily observations.</div>
      </div>
    );
  }

  return (
    <div className="position-history-list">
      {visible.map((row) => {
        const points = row.points.slice(-14);
        const latest = row.points.at(-1);
        const maxRank = Math.max(10, ...points.map((p) => p.position ?? 10));
        return (
          <div key={row.keywordId} className="position-history-row">
            <div className="position-history-main">
              <button className="kw-ideas-name" onClick={() => onOpenKeyword(row.keyword)}>
                {row.keyword}
              </button>
              <div className="position-history-meta">
                {latest ? (
                  <>
                    <span>{latest.position == null ? "Not ranked" : `#${latest.position}`}</span>
                    <GrowthBadge growth={latest.delta} />
                    <span>{latest.date}</span>
                  </>
                ) : (
                  <span>No observations yet</span>
                )}
              </div>
            </div>
            {points.length <= 1 ? (
              <div className="position-history-empty">Needs 2 daily observations</div>
            ) : (
              <div className="position-spark" aria-label={`${row.keyword} position history`}>
                {points.map((point, i) => {
                  const height = point.position == null ? 8 : Math.max(8, 38 - ((point.position - 1) / maxRank) * 30);
                  return (
                    <span
                      key={`${point.date}-${i}`}
                      className={point.position == null ? "missing" : ""}
                      style={{ height }}
                      title={`${point.date}: ${point.position == null ? "Not ranked" : `#${point.position}`}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
  const [addMode, setAddMode] = useState<AddMode>("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AppListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlResolving, setUrlResolving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AppCandidate | null>(null);

  const [opps, setOpps] = useState<KeywordDifficulty[]>([]);
  const [oppLoading, setOppLoading] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<TrackedAppKeywordRanking[]>([]);
  const [history, setHistory] = useState<TrackedAppPositionSeries[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [rankSearch, setRankSearch] = useState("");
  const [rankSort, setRankSort] = useState<RankSort>("position");
  const [rankDir, setRankDir] = useState<SortDir>("asc");
  const [rankCountry, setRankCountry] = useState("US");
  const [customKeyword, setCustomKeyword] = useState("");
  const [keywordBusy, setKeywordBusy] = useState<string | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState<DetailTab>("rankings");
  const [progress, setProgress] = useState<TrackingProgress | null>(null);

  useEffect(() => () => syncCancel.current?.(), []);

  // Load the server-persisted tracked apps (survives reload).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchTrackedApps(ctrl.signal).then(setTracked).catch(() => {});
    return () => ctrl.abort();
  }, []);

  const selected = tracked.find((t) => t.appId === selectedId) ?? null;
  const trackedKeywordSet = useMemo(
    () => new Set(rankings.map((row) => row.keyword.toLowerCase())),
    [rankings],
  );

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
    if (!adding || addMode !== "search") return;
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
  }, [query, adding, addMode]);

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
    setHistory([]);
    fetchTrackedAppRankingsWithHistory(app.id, signal, { refresh, country })
      .then((data) => {
        if (!signal?.aborted) {
          setRankings(data.rankings);
          setHistory(data.history);
        }
      })
      .catch((e) => {
        if (!signal?.aborted) {
          setRankings([]);
          setHistory([]);
          setRankError(e instanceof Error ? e.message : "Failed to load rankings");
        }
      })
      .finally(() => { if (!signal?.aborted) setRankLoading(false); });
  }, [rankCountry]);

  useEffect(() => {
    if (!selected) {
      setRankings([]);
      setHistory([]);
      setRankSearch("");
      setSimilar({});
      return;
    }
    const ctrl = new AbortController();
    loadRankings(selected, ctrl.signal, false, rankCountry);
    return () => ctrl.abort();
  }, [loadRankings, rankCountry, selected?.id]);

  useEffect(() => {
    setSimilar({});
  }, [rankCountry]);

  function applySyncDone(done: TrackedAppSyncDone) {
    setTracked((prev) => {
      const without = prev.filter((t) => t.id !== done.tracked.id);
      return [done.tracked, ...without];
    });
    setSelectedId(done.tracked.appId);
    if (rankCountry === done.tracked.country) {
      setRankings(done.rankings);
      setHistory(done.history);
      setRankLoading(false);
    } else {
      fetchTrackedAppRankingsWithHistory(done.tracked.id, undefined, { country: rankCountry })
        .then((data) => {
          setRankings(data.rankings);
          setHistory(data.history);
        })
        .catch((e) => setRankError(e instanceof Error ? e.message : "Failed to load rankings"))
        .finally(() => setRankLoading(false));
    }
    fetchTrackedApps().then(setTracked).catch(() => {});
  }

  function startAddSync(a: AppCandidate) {
    syncCancel.current?.();
    setRankLoading(true);
    setRankError(null);
    setRankings([]);
    setHistory([]);
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

  async function addApp(a: AppCandidate) {
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

  async function resolveUrlAdd() {
    const id = parseStoreUrl(urlInput);
    if (!id) {
      setUrlError("Paste a valid App Store or Google Play app URL.");
      return;
    }
    setUrlResolving(true);
    setUrlError(null);
    try {
      const app = await getApp(id);
      setConfirming({
        id: app.id,
        title: app.title,
        developer: app.developer,
        iconUrl: app.iconUrl,
        store: app.store,
        category: app.category,
        rating: app.rating,
        reviewCount: app.reviewCount,
      });
    } catch {
      setUrlError("Couldn't resolve that store URL.");
    } finally {
      setUrlResolving(false);
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

  async function addKeyword(app: TrackedApp, keyword: string) {
    const kw = keyword.trim();
    if (!kw) return;
    setKeywordBusy(`add:${kw.toLowerCase()}`);
    setKeywordError(null);
    try {
      const data = await addTrackedAppKeyword(app.id, kw, rankCountry);
      setRankings(data.rankings);
      setHistory(data.history);
      setCustomKeyword("");
      fetchTrackedApps().then(setTracked).catch(() => {});
    } catch (e) {
      setKeywordError(e instanceof Error ? e.message : "Failed to add keyword");
    } finally {
      setKeywordBusy(null);
    }
  }

  async function removeKeyword(app: TrackedApp, keyword: string) {
    setKeywordBusy(`remove:${keyword}`);
    setKeywordError(null);
    try {
      const data = await removeTrackedAppKeyword(app.id, keyword, rankCountry);
      setRankings(data.rankings);
      setHistory(data.history);
      setSimilar((prev) => {
        const next = { ...prev };
        delete next[keyword];
        return next;
      });
      fetchTrackedApps().then(setTracked).catch(() => {});
    } catch (e) {
      setKeywordError(e instanceof Error ? e.message : "Failed to remove keyword");
    } finally {
      setKeywordBusy(null);
    }
  }

  async function findSimilar(app: TrackedApp, keyword: string) {
    setKeywordBusy(`similar:${keyword}`);
    setKeywordError(null);
    try {
      const ideas = await fetchTrackedAppSimilarKeywords(app.id, keyword, rankCountry);
      setSimilar((prev) => ({ ...prev, [keyword]: ideas.filter((idea) => !trackedKeywordSet.has(idea.toLowerCase())) }));
    } catch (e) {
      setKeywordError(e instanceof Error ? e.message : "Failed to find similar keywords");
    } finally {
      setKeywordBusy(null);
    }
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
              <div className="track-add-modes">
                <button className={addMode === "search" ? "on" : ""} onClick={() => { setAddMode("search"); setConfirming(null); }}>
                  Search
                </button>
                <button className={addMode === "url" ? "on" : ""} onClick={() => { setAddMode("url"); setConfirming(null); }}>
                  Paste URL
                </button>
              </div>

              {confirming ? (
                <div className="track-confirm-card">
                  <AppAvatar title={confirming.title} iconUrl={confirming.iconUrl} />
                  <div className="track-confirm-meta">
                    <div className="track-confirm-title">
                      {confirming.store === "apple" ? <IconApple /> : <IconGooglePlay />}
                      {confirming.title}
                    </div>
                    <div className="track-confirm-dev">{confirming.developer}</div>
                    <div className="track-confirm-stats">
                      <span>{confirming.category ?? "Uncategorized"}</span>
                      <span><IconStar /> {confirming.rating != null ? confirming.rating.toFixed(1) : "—"}</span>
                      <span>{formatCompact(confirming.reviewCount)} reviews</span>
                    </div>
                  </div>
                  <div className="track-confirm-actions">
                    <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
                    <button className="btn btn-accent" onClick={() => addApp(confirming)}>
                      <IconPlus /> Add app
                    </button>
                  </div>
                </div>
              ) : addMode === "search" ? (
                <>
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
                      <button key={a.id} className="track-result" onClick={() => setConfirming(a)}>
                        <AppAvatar title={a.title} iconUrl={a.iconUrl} />
                        <div className="track-result-meta">
                          <div className="t">{a.title}</div>
                          <div className="s">{a.developer}</div>
                          <div className="track-result-facts">
                            <span>{a.category ?? "Uncategorized"}</span>
                            <span><IconStar /> {a.rating != null ? a.rating.toFixed(1) : "—"}</span>
                          </div>
                        </div>
                        <IconPlus className="add-mark" style={{ width: 15, height: 15 }} />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="track-url-mode">
                  <label>App Store or Google Play URL</label>
                  <div className="track-url-row">
                    <input
                      autoFocus
                      value={urlInput}
                      onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && resolveUrlAdd()}
                      placeholder="https://apps.apple.com/.../id123456789"
                      spellCheck={false}
                    />
                    <button className="btn btn-accent" disabled={urlResolving || !urlInput.trim()} onClick={resolveUrlAdd}>
                      {urlResolving ? "Finding…" : "Resolve"}
                    </button>
                  </div>
                  {urlError && <div className="track-url-error">{urlError}</div>}
                  <div className="track-url-hints">
                    <span><IconApple /> apps.apple.com/.../id123456789</span>
                    <span><IconGooglePlay /> play.google.com/store/apps/details?id=...</span>
                  </div>
                </div>
              )}
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

              <div className="track-tabs">
                <button className={activeTab === "rankings" ? "on" : ""} onClick={() => setActiveTab("rankings")}>Rankings</button>
                <button className={activeTab === "history" ? "on" : ""} onClick={() => setActiveTab("history")}>Position History</button>
                <button className={activeTab === "opportunities" ? "on" : ""} onClick={() => setActiveTab("opportunities")}>Opportunities</button>
              </div>

              <div className="section-head" style={{ margin: "22px 0 11px" }}>
                <div className="section-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                  {activeTab === "opportunities" ? (
                    <><IconSpark style={{ width: 13, height: 13, color: "var(--accent)" }} /> Keyword opportunities</>
                  ) : activeTab === "history" ? (
                    <><IconChart style={{ width: 13, height: 13, color: "var(--accent)" }} /> Position History</>
                  ) : (
                    <><IconRank style={{ width: 13, height: 13, color: "var(--accent)" }} /> Keyword rankings</>
                  )}
                </div>
                {activeTab !== "opportunities" && (
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
                )}
              </div>

              {rankError && (
                <div className="notice" style={{ marginBottom: 12 }}>
                  <IconInfo /> {rankError}. Start the API server and retry.
                </div>
              )}
              {keywordError && (
                <div className="notice" style={{ marginBottom: 12 }}>
                  <IconInfo /> {keywordError}
                </div>
              )}

              {activeTab === "rankings" && (rankLoading ? (
                <div className="opp-list">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 46, borderRadius: 8 }} />)}
                </div>
              ) : (
                <>
                  <form
                    className="track-custom-keyword"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addKeyword(selected, customKeyword);
                    }}
                  >
                    <input
                      value={customKeyword}
                      onChange={(e) => setCustomKeyword(e.target.value)}
                      placeholder={`Add keyword in ${rankCountry}`}
                      spellCheck={false}
                    />
                    <button className="btn btn-accent" disabled={!customKeyword.trim() || keywordBusy?.startsWith("add:")}>
                      <IconPlus /> Add keyword
                    </button>
                  </form>
                  {rankings.length === 0 && !rankError ? (
                    <div className="aso-empty">
                      <IconRank />
                      <div className="t">No generated keywords yet</div>
                      <div className="s">Add a custom keyword in {rankCountry} or refresh the app to sync live rankings across {MARKET_COUNT} markets.</div>
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
                                <th>Growth</th>
                                <th className="kw-ideas-appshead">Ranking apps</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                          {visibleRankings.map((row) => {
                            const ideas = similar[row.keyword] ?? [];
                            return (
                              <tr key={row.keywordId}>
                                <td>
                                  <button className="kw-ideas-name" onClick={() => navigate(`/dashboard/aso/keywords?q=${encodeURIComponent(row.keyword)}`)}>
                                    {row.keyword}
                                  </button>
                                  {ideas.length > 0 && (
                                    <div className="track-similar-list">
                                      {ideas.map((idea) => (
                                        <button
                                          key={idea}
                                          type="button"
                                          onClick={() => addKeyword(selected, idea)}
                                          disabled={keywordBusy === `add:${idea.toLowerCase()}`}
                                        >
                                          <IconPlus /> {idea}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="num">{row.position == null ? "Not ranked" : `#${row.position}`}</td>
                                <td><Meter kind="popularity" label="Popularity" value={row.popularity ?? 0} /></td>
                                <td><Meter kind="difficulty" label="Difficulty" value={row.difficulty ?? 0} /></td>
                                <td><GrowthBadge growth={row.growth} /></td>
                                <td><RankingAppsStack apps={row.topApps} /></td>
                                <td className="kw-ideas-action track-row-actions">
                                  <button className="kw-ideas-expand" title="AI find similar keywords" disabled={keywordBusy === `similar:${row.keyword}`} onClick={() => findSimilar(selected, row.keyword)}>
                                    <IconSpark />
                                  </button>
                                  <button className="kw-ideas-expand" title="Open in Keyword Workspace" onClick={() => navigate(`/dashboard/aso/keywords?q=${encodeURIComponent(row.keyword)}`)}>
                                    <IconExternal />
                                  </button>
                                  <button className="kw-ideas-expand danger" title="Remove keyword" disabled={keywordBusy === `remove:${row.keyword}`} onClick={() => removeKeyword(selected, row.keyword)}>
                                    <IconTrash />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                      )}
                    </>
                  )}
                </>
              ))}

              {activeTab === "history" && (rankLoading ? (
                <div className="opp-list">
                  {[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 58, borderRadius: 8 }} />)}
                </div>
              ) : (
                <>
                  <div className="search track-rank-search">
                    <IconSearch />
                    <input value={rankSearch} onChange={(e) => setRankSearch(e.target.value)} placeholder="Search keywords…" spellCheck={false} />
                  </div>
                  <PositionHistoryPanel
                    history={history}
                    search={rankSearch}
                    onOpenKeyword={(keyword) => navigate(`/dashboard/aso/keywords?q=${encodeURIComponent(keyword)}`)}
                  />
                </>
              ))}

              {activeTab === "opportunities" && oppError && (
                <div className="notice" style={{ marginBottom: 12 }}>
                  <IconInfo /> {oppError}. Start the API server and retry.
                </div>
              )}

              {activeTab === "opportunities" && (oppLoading ? (
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
                    const isTracked = trackedKeywordSet.has(kd.keyword.toLowerCase());
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
                        <button className={`track-btn ${isTracked ? "on" : ""}`} disabled={isTracked || keywordBusy === `add:${kd.keyword.toLowerCase()}`} onClick={() => addKeyword(selected, kd.keyword)}>
                          {isTracked ? <><IconCheck /> Tracked</> : <><IconPlus /> Track</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
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

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type {
  OrganicAppGroup,
  OrganicSearchScope,
  OrganicSortField,
  OrganicVideo,
} from "@kittie/types";
import { EmptyState } from "../components/EmptyState";
import { FilterGroup, SubLabel } from "../components/FilterGroup";
import { Pagination } from "../components/Pagination";
import { Pills, TogglePill } from "../components/Pills";
import { RangeFilter } from "../components/RangeFilter";
import { listApps, listOrganic, refreshOrganic } from "../lib/api";
import { formatCompact, formatRating } from "../lib/format";
import type { Theme } from "../lib/theme";
import { IconClose, IconFilter, IconMoon, IconRefresh, IconSearch, IconSun, IconUsers } from "../icons";

const PAGE = 12;

type SortOrder = "asc" | "desc";
type Range = { min?: number; max?: number };
const rangeSet = (r: Range) => r.min != null || r.max != null;

// Rail parity with Ads — organic rows don't carry a language column yet.
const APP_LANGUAGES = ["English", "Spanish", "Portuguese", "French", "German", "Japanese", "Korean"];

const SORT_OPTIONS: { id: OrganicSortField; label: string }[] = [
  { id: "videos", label: "Videos" },
  { id: "revenue", label: "Revenue" },
  { id: "installs", label: "Installs" },
  { id: "released", label: "Released" },
];

const SCOPE_OPTIONS: { id: OrganicSearchScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "apps", label: "Apps" },
  { id: "creators", label: "Creators" },
];

/* truth-matching metric formats: "$<100", "$405K"; "Jul 2025" */
function formatRevenue(n: number | null): string {
  if (n == null) return "—";
  if (n > 0 && n < 100) return "$<100";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
function formatMonthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function OrganicContentPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  // rail state (mirrors AdsLibraryPage)
  const [selectedApp, setSelectedApp] = useState<{ id: string; title: string } | null>(null);
  const [appQuery, setAppQuery] = useState("");
  const [appOptions, setAppOptions] = useState<{ id: string; title: string }[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [allCats, setAllCats] = useState<string[]>([]);
  const [langs, setLangs] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<Range>({});
  const [mrr, setMrr] = useState<Range>({});
  const [sortBy, setSortBy] = useState<OrganicSortField>("videos");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // topbar search + "Search in" scope
  const [scope, setScope] = useState<OrganicSearchScope>("all");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // results
  const [groups, setGroups] = useState<OrganicAppGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0); // 0-based locally; API is 1-based
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // refresh seam
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const appId = selectedApp?.id;
  const categories = cats.join(",");

  useEffect(() => {
    listApps({ limit: 100 })
      .then((res) => {
        const set = new Set<string>();
        for (const a of res.data) if (a.category) set.add(a.category);
        setAllCats([...set].sort());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = appQuery.trim();
    if (!q) {
      setAppOptions([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      listApps({ search: q, limit: 8 }, ac.signal)
        .then((res) => setAppOptions(res.data.map((a) => ({ id: a.id, title: a.title }))))
        .catch(() => {});
    }, 280);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [appQuery]);

  useEffect(() => {
    setPage(0);
  }, [appId, categories, search, scope, sortBy, sortOrder, downloads.min, downloads.max, mrr.min, mrr.max]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    listOrganic(
      {
        appId,
        categories: categories || undefined,
        search: search || undefined,
        searchScope: scope,
        minDownloads: downloads.min,
        maxDownloads: downloads.max,
        minRevenue: mrr.min,
        maxRevenue: mrr.max,
        sortBy,
        sortOrder,
        page: page + 1,
        limit: PAGE,
      },
      ac.signal,
    )
      .then((res) => {
        if (ac.signal.aborted) return;
        setGroups(res.data);
        setTotal(res.pagination.totalCount);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted || (e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
    return () => ac.abort();
  }, [appId, categories, search, scope, sortBy, sortOrder, downloads, mrr, page, refreshKey]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  async function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setToast(null);
    try {
      const res = await refreshOrganic();
      setToast(`Refreshed ${res.videos} videos across ${res.apps} apps`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const toggleCat = (cat: string) =>
    setCats((c) => (c.includes(cat) ? c.filter((x) => x !== cat) : [...c, cat]));
  const toggleLang = (lang: string) =>
    setLangs((l) => (l.includes(lang) ? l.filter((x) => x !== lang) : [...l, lang]));

  const activeCount =
    (selectedApp ? 1 : 0) +
    (cats.length > 0 ? 1 : 0) +
    (langs.length > 0 ? 1 : 0) +
    (rangeSet(downloads) ? 1 : 0) +
    (rangeSet(mrr) ? 1 : 0);

  function clearAll() {
    setSelectedApp(null);
    setAppQuery("");
    setCats([]);
    setLangs([]);
    setDownloads({});
    setMrr({});
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  return (
    <main className="main">
      <header className="topbar">
        <div className="topbar-row">
          <div className="page-title-wrap">
            <div className="page-icon">
              <IconUsers style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="page-title">Organic Content</div>
              <div className="page-sub">Browse apps with creator videos</div>
            </div>
            <span className="count-chip">{total.toLocaleString()}</span>
          </div>

          <div className="topbar-spacer" />

          <button
            className="btn"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh organic content"
          >
            <IconRefresh style={{ width: 15, height: 15 }} />
            {refreshing ? "Refreshing…" : "Refresh organic content"}
          </button>

          <div className="search">
            <IconSearch />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search apps…"
              spellCheck={false}
            />
          </div>

          <div style={{ position: "relative" }}>
            <button
              className="btn"
              aria-haspopup="menu"
              aria-expanded={scopeOpen}
              onClick={() => setScopeOpen((o) => !o)}
              title="Search scope"
            >
              Search in: {SCOPE_OPTIONS.find((s) => s.id === scope)?.label}
            </button>
            {scopeOpen && (
              <div className="menu-pop" style={menuStyle} role="menu">
                {SCOPE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    role="menuitem"
                    className={`menu-item ${s.id === scope ? "on" : ""}`}
                    style={menuItemStyle}
                    onClick={() => {
                      setScope(s.id);
                      setScopeOpen(false);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
        {toast && <div className="page-sub" style={{ padding: "4px 0 0" }}>{toast}</div>}
      </header>

      <div className="rail-layout">
        <aside className="filter-rail">
          <div className="filter-rail-head">
            <span className="filter-rail-title">
              <IconFilter />
              Filters
              {activeCount > 0 && <span className="filter-rail-count">{activeCount}</span>}
            </span>
            {activeCount > 0 && (
              <button className="link-btn" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          <div className="filter-rail-body">
            <FilterGroup label="App" defaultOpen active={!!selectedApp} summary={selectedApp?.title}>
              {selectedApp ? (
                <div className="pill-wrap">
                  <button className="fpill on" onClick={() => setSelectedApp(null)}>
                    {selectedApp.title}
                    <IconClose />
                  </button>
                </div>
              ) : (
                <>
                  <div className="search" style={{ flex: "none", minWidth: 0 }}>
                    <IconSearch />
                    <input
                      value={appQuery}
                      onChange={(e) => setAppQuery(e.target.value)}
                      placeholder="Search apps…"
                      spellCheck={false}
                    />
                  </div>
                  {appQuery.trim() &&
                    (appOptions.length > 0 ? (
                      <div className="pill-wrap">
                        {appOptions.map((a) => (
                          <button
                            key={a.id}
                            className="fpill"
                            onClick={() => {
                              setSelectedApp(a);
                              setAppQuery("");
                              setAppOptions([]);
                            }}
                          >
                            {a.title}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="filter-hint">No matching apps</div>
                    ))}
                </>
              )}
            </FilterGroup>

            <FilterGroup
              label="Category"
              active={cats.length > 0}
              summary={cats.length ? `${cats.length} selected` : undefined}
            >
              {allCats.length === 0 ? (
                <div className="filter-hint">Loading categories…</div>
              ) : (
                <div className="pill-wrap">
                  {allCats.map((cat) => (
                    <button
                      key={cat}
                      className={`fpill ${cats.includes(cat) ? "on" : ""}`}
                      onClick={() => toggleCat(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </FilterGroup>

            <FilterGroup
              label="App language"
              active={langs.length > 0}
              summary={langs.length ? `${langs.length} selected` : undefined}
            >
              <div className="pill-wrap">
                {APP_LANGUAGES.map((lang) => (
                  <TogglePill key={lang} on={langs.includes(lang)} onToggle={() => toggleLang(lang)}>
                    {lang}
                  </TogglePill>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Downloads" active={rangeSet(downloads)} summary={rangeSet(downloads) ? "Set" : undefined}>
              <RangeFilter
                min={downloads.min}
                max={downloads.max}
                onChange={setDownloads}
                quick={[
                  { label: "1K+", min: 1000 },
                  { label: "10K+", min: 10000 },
                  { label: "100K+", min: 100000 },
                  { label: "1M+", min: 1000000 },
                ]}
              />
            </FilterGroup>

            <FilterGroup label="MRR" active={rangeSet(mrr)} summary={rangeSet(mrr) ? "Set" : undefined}>
              <RangeFilter
                min={mrr.min}
                max={mrr.max}
                onChange={setMrr}
                quick={[
                  { label: "$1K+", min: 1000 },
                  { label: "$10K+", min: 10000 },
                  { label: "$100K+", min: 100000 },
                  { label: "$1M+", min: 1000000 },
                ]}
                prefix="$"
              />
            </FilterGroup>

            <FilterGroup label="Sort" defaultOpen active={sortBy !== "videos"}>
              <SubLabel>Sort by</SubLabel>
              <Pills<OrganicSortField> value={sortBy} onSelect={setSortBy} options={SORT_OPTIONS} />
              <SubLabel>Direction</SubLabel>
              <Pills<SortOrder>
                value={sortOrder}
                onSelect={setSortOrder}
                options={[
                  { id: "desc", label: "High first" },
                  { id: "asc", label: "Low first" },
                ]}
              />
            </FilterGroup>
          </div>
        </aside>

        <div className="explore-main">
          <div className="count-line" style={{ padding: "12px 22px 0", color: "var(--text-secondary)", fontSize: 13 }}>
            Showing <strong>{groups.length}</strong> of <strong>{total.toLocaleString()}</strong> apps
          </div>

          <div className="table-scroll" ref={scrollRef}>
            {error ? (
              <EmptyState
                icon={<IconUsers />}
                title="Couldn’t load organic content"
                sub={`${error}. Start the API server and retry.`}
              />
            ) : loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 22 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ ...cardStyle, height: 280 }}>
                    <div style={{ display: "flex", gap: 11, padding: "12px 14px" }}>
                      <div className="skel skel-circ" style={{ width: 42, height: 42 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                        <div className="skel" style={{ height: 13, width: "40%" }} />
                        <div className="skel" style={{ height: 10, width: "25%" }} />
                      </div>
                    </div>
                    <div className="skel" style={{ height: 150, margin: "0 14px", borderRadius: 8 }} />
                  </div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <EmptyState
                icon={<IconUsers />}
                title={activeCount > 0 || search ? "No apps match these filters" : "No organic content yet"}
                sub={
                  activeCount > 0 || search
                    ? "Try widening a range or clearing a filter from the rail."
                    : "Run the organic ingest (or hit Refresh) to populate creator videos."
                }
                action={
                  activeCount > 0 ? (
                    <button className="btn" onClick={clearAll}>
                      Clear filters
                    </button>
                  ) : (
                    <button className="btn" onClick={onRefresh} disabled={refreshing}>
                      Refresh organic content
                    </button>
                  )
                }
              />
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 22 }}>
                  {groups.map((g, i) => (
                    <OrganicCard key={g.app.id} group={g} rank={page * PAGE + i + 1} />
                  ))}
                </div>
                <div className="pager-bottom">
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    count={groups.length}
                    pageSize={PAGE}
                    loading={loading}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    onPrev={() => setPage((p) => (p > 0 ? p - 1 : p))}
                    onNext={() => setPage((p) => (p < totalPages - 1 ? p + 1 : p))}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------------- card ---------------- */

const cardStyle: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 20,
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 4,
  minWidth: 140,
  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
};
const menuItemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "7px 10px",
  borderRadius: 6,
  background: "none",
  border: "none",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 64 }}>
      <span style={{ fontSize: 10, letterSpacing: 0.4, color: "var(--text-faint)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function OrganicCard({ group, rank }: { group: OrganicAppGroup; rank: number }) {
  const { app, videos, videoCount, screenshotUrls } = group;
  const carouselRef = useRef<HTMLDivElement>(null);
  const appHref = `/apps/${encodeURIComponent(app.id)}`;

  return (
    <article style={cardStyle}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-faint)", minWidth: 26 }}>
          #{rank}
        </span>
        <Link to={appHref} className="app-cell" style={{ flex: 1, minWidth: 0 }}>
          {app.iconUrl ? (
            <img className="app-icon" src={app.iconUrl} alt="" loading="lazy" />
          ) : (
            <div className="app-icon placeholder">{app.title.charAt(0).toUpperCase()}</div>
          )}
          <div className="app-meta">
            <div className="app-title">{app.title}</div>
            <div className="app-dev">{app.developer}</div>
          </div>
        </Link>
        <Link to={appHref} className="link-btn" style={{ whiteSpace: "nowrap" }}>
          Open app
        </Link>
      </div>

      {/* metrics */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          padding: "0 16px 12px",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <Metric label="" value={`★ ${formatRating(app.rating)}`} />
        <Metric label="REVIEWS" value={formatCompact(app.reviewCount)} />
        <Metric label="REVENUE" value={formatRevenue(app.revenueEstimate30d)} />
        <Metric label="INSTALLS" value={formatCompact(app.downloadsEstimate30d)} />
        <Metric label="RELEASED" value={formatMonthYear(app.releasedAt)} />
        <Metric label="VIDEOS" value={String(videoCount)} />
      </div>

      {/* screenshot strip (Listing media) */}
      {screenshotUrls.length > 0 && (
        <div style={stripStyle}>
          {screenshotUrls.slice(0, 8).map((url, i) => (
            <Link key={i} to={appHref} aria-label={`${app.title} screenshot ${i + 1}`} style={{ flex: "none" }}>
              <img
                src={url}
                alt=""
                loading="lazy"
                style={{ height: 132, width: 76, objectFit: "cover", borderRadius: 8, display: "block", background: "var(--surface-2)" }}
              />
            </Link>
          ))}
        </div>
      )}

      {/* creator-video carousel */}
      <div style={{ position: "relative", padding: "10px 14px 14px" }}>
        <div ref={carouselRef} style={carouselStyle}>
          {videos.map((v) => (
            <VideoTile key={v.id} video={v} />
          ))}
        </div>
        <button
          className="icon-btn"
          aria-label="Scroll organic videos right"
          onClick={() => carouselRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "var(--panel)",
            border: "1px solid var(--border)",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </article>
  );
}

const stripStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "12px 14px",
  scrollbarWidth: "thin",
};

const carouselStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  overflowX: "auto",
  paddingBottom: 4,
  scrollbarWidth: "thin",
};

/** Deterministic gradient from the handle — the tile's "thumbnail". */
function handleGradient(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (Math.imul(h, 31) + handle.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 45 + ((h >> 4) % 90)) % 360;
  return `linear-gradient(150deg, hsl(${a} 68% 46%), hsl(${b} 60% 32%))`;
}

function VideoTile({ video }: { video: OrganicVideo }) {
  return (
    <button
      aria-label={`Open organic video from ${video.creatorHandle}`}
      title={video.caption ?? video.creatorHandle}
      onClick={() => {
        if (video.videoUrl) window.open(video.videoUrl, "_blank", "noopener,noreferrer");
      }}
      style={{
        flex: "none",
        position: "relative",
        width: 108,
        height: 192,
        borderRadius: 10,
        border: "1px solid var(--border-soft)",
        background: handleGradient(video.creatorHandle),
        cursor: "pointer",
        overflow: "hidden",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 99,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.4)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "14px 8px 7px",
          fontSize: 10.5,
          fontWeight: 600,
          color: "#fff",
          textAlign: "left",
          background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {video.creatorHandle}
      </span>
    </button>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { FilterGroup, SubLabel } from "../components/FilterGroup";
import { Pagination } from "../components/Pagination";
import { Pills, TogglePill } from "../components/Pills";
import { RangeFilter } from "../components/RangeFilter";
import { Segmented } from "../components/Segmented";
import { Tabs } from "../components/Tabs";
import { listApps } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Theme } from "../lib/theme";
import { IconClose, IconFilter, IconImage, IconMoon, IconSearch, IconSun } from "../icons";

/* ---------------- inline ads API client (mirrors lib/api.ts conventions) ---------------- */

const BASE = "/api/v1";
const PAGE = 24;

interface AdAppSummary {
  id: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
}

interface AdCreative {
  id: string;
  appId: string;
  adLibraryId: string | null;
  adCopy: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  status: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  app: AdAppSummary;
}

interface AdsResponse {
  data: AdCreative[];
  pagination: { page: number; limit: number; totalCount: number };
}

type AdsParams = Record<string, string | number | undefined>;

async function listAds(params: AdsParams, signal?: AbortSignal): Promise<AdsResponse> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  const res = await fetch(`${BASE}/ads${s ? `?${s}` : ""}`, { signal });
  if (!res.ok) throw new Error(`Failed to load ads (${res.status})`);
  return (await res.json()) as AdsResponse;
}

/* ---------------- filters ---------------- */

type MediaFilter = "all" | "image" | "video";
type SortOrder = "asc" | "desc";
type Range = { min?: number; max?: number };

// The live product filters ads by creative language; our meta_ads rows don't
// carry a language column yet, so this section is rail parity only.
const AD_LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
];

const rangeSet = (r: Range) => r.min != null || r.max != null;

/* ---------------- page ---------------- */

export function AdsLibraryPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  // rail state
  const [selectedApp, setSelectedApp] = useState<{ id: string; title: string } | null>(null);
  const [appQuery, setAppQuery] = useState("");
  const [appOptions, setAppOptions] = useState<{ id: string; title: string }[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [allCats, setAllCats] = useState<string[]>([]);
  const [langs, setLangs] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<Range>({});
  const [mrr, setMrr] = useState<Range>({});
  const [media, setMedia] = useState<MediaFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // topbar search → API `search` (LIKE on ad copy / app title), debounced
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // results
  const [ads, setAds] = useState<AdCreative[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0); // 0-based locally; API is 1-based
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const appId = selectedApp?.id;
  const categories = cats.join(",");

  // category options come from the apps index, like ExplorePage
  useEffect(() => {
    listApps({ limit: 100 })
      .then((res) => {
        const set = new Set<string>();
        for (const a of res.data) if (a.category) set.add(a.category);
        setAllCats([...set].sort());
      })
      .catch(() => {});
  }, []);

  // app picker suggestions, debounced
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

  // any filter change rewinds to the first page
  useEffect(() => {
    setPage(0);
  }, [appId, categories, media, search, sortOrder]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    listAds(
      {
        appId,
        categories: categories || undefined,
        media: media === "all" ? undefined : media,
        search: search || undefined,
        sortBy: "startDate",
        sortOrder,
        page: page + 1,
        limit: PAGE,
      },
      ac.signal,
    )
      .then((res) => {
        if (ac.signal.aborted) return;
        setAds(res.data);
        setTotal(res.pagination.totalCount);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted || (e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
    return () => ac.abort();
  }, [appId, categories, media, search, sortOrder, page]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const toggleCat = (cat: string) =>
    setCats((c) => (c.includes(cat) ? c.filter((x) => x !== cat) : [...c, cat]));
  const toggleLang = (lang: string) =>
    setLangs((l) => (l.includes(lang) ? l.filter((x) => x !== lang) : [...l, lang]));

  const activeCount =
    (selectedApp ? 1 : 0) +
    (cats.length > 0 ? 1 : 0) +
    (langs.length > 0 ? 1 : 0) +
    (rangeSet(downloads) ? 1 : 0) +
    (rangeSet(mrr) ? 1 : 0) +
    (media !== "all" ? 1 : 0);

  function clearAll() {
    setSelectedApp(null);
    setAppQuery("");
    setCats([]);
    setLangs([]);
    setDownloads({});
    setMrr({});
    setMedia("all");
    setSortOrder("desc");
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
              <IconImage style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h1 className="page-title">Ads Library</h1>
              <div className="page-sub">Search and filter creatives</div>
            </div>
            <span className="count-chip">{total.toLocaleString()}</span>
          </div>

          <div className="topbar-spacer" />

          <div className="search">
            <IconSearch />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search ad copy, apps…"
              spellCheck={false}
            />
          </div>

          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      <div className="rail-layout">
        {/* ---------------- filter rail ---------------- */}
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
              label="Ad language"
              active={langs.length > 0}
              summary={langs.length ? `${langs.length} selected` : undefined}
            >
              <div className="pill-wrap">
                {AD_LANGUAGES.map((lang) => (
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

            <FilterGroup
              label="Creative"
              defaultOpen
              active={media !== "all"}
              summary={media !== "all" ? (media === "image" ? "Image" : "Video") : undefined}
            >
              <SubLabel>Media</SubLabel>
              <Segmented<MediaFilter>
                value={media}
                onChange={setMedia}
                options={[
                  { id: "all", label: "All" },
                  { id: "image", label: "Image" },
                  { id: "video", label: "Video" },
                ]}
              />
            </FilterGroup>

            <FilterGroup label="Sort" defaultOpen active={false}>
              <SubLabel>Sort by</SubLabel>
              <Pills<"startDate">
                value="startDate"
                onSelect={() => {}}
                options={[{ id: "startDate", label: "Start date" }]}
              />
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

        {/* ---------------- creatives ---------------- */}
        <div className="explore-main">
          <div style={{ padding: "0 22px" }}>
            <Tabs items={[{ id: "all", label: "All", count: total }]} active="all" onChange={() => {}} />
          </div>

          <div className="table-scroll" ref={scrollRef}>
            {error ? (
              <EmptyState
                icon={<IconImage />}
                title="Couldn’t load ads"
                sub={`${error}. Start the API server and retry.`}
              />
            ) : loading ? (
              <div style={gridStyle}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={cardStyle}>
                    <div style={{ display: "flex", gap: 11, padding: "10px 12px" }}>
                      <div className="skel skel-circ" style={{ width: 34, height: 34 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div className="skel" style={{ height: 12, width: "70%" }} />
                        <div className="skel" style={{ height: 10, width: "45%" }} />
                      </div>
                    </div>
                    <div className="skel" style={{ aspectRatio: "4 / 3", borderRadius: 0 }} />
                    <div style={{ padding: "10px 12px" }}>
                      <div className="skel" style={{ height: 11, width: "85%" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : ads.length === 0 ? (
              <EmptyState
                icon={<IconImage />}
                title={activeCount > 0 || search ? "No ads match these filters" : "No ad creatives yet"}
                sub={
                  activeCount > 0 || search
                    ? "Try widening a range or clearing a filter from the rail."
                    : "Once Meta Ad Library creatives are ingested, they’ll show up here."
                }
                action={
                  activeCount > 0 ? (
                    <button className="btn" onClick={clearAll}>
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div style={gridStyle}>
                  {ads.map((ad) => (
                    <AdCard key={ad.id} ad={ad} />
                  ))}
                </div>
                <div className="pager-bottom">
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    count={ads.length}
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

/* ---------------- creative card ---------------- */

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
  gap: 14,
  padding: 22,
};

const cardStyle: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

function AdCard({ ad }: { ad: AdCreative }) {
  const statusLabel = ad.status ?? "Unknown";
  const isActive = (ad.status ?? "").toLowerCase() === "active";

  return (
    <article style={cardStyle}>
      <Link to={`/apps/${encodeURIComponent(ad.app.id)}`} className="app-cell" style={{ padding: "10px 12px" }}>
        {ad.app.iconUrl ? (
          <img className="app-icon" src={ad.app.iconUrl} alt="" loading="lazy" />
        ) : (
          <div className="app-icon placeholder">{ad.app.title.charAt(0).toUpperCase()}</div>
        )}
        <div className="app-meta">
          <div className="app-title">{ad.app.title}</div>
          <div className="app-dev">{ad.app.developer}</div>
        </div>
      </Link>

      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 3",
          background: "var(--surface-2)",
          borderTop: "1px solid var(--border-soft)",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        {ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
            <IconImage style={{ width: 28, height: 28 }} />
          </div>
        )}
        {ad.videoUrl && (
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 99,
                background: "rgba(0, 0, 0, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        )}
      </div>

      {ad.adCopy && (
        <p
          style={{
            margin: 0,
            padding: "10px 12px 0",
            fontSize: 12.5,
            color: "var(--text-secondary)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {ad.adCopy}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px 12px",
          marginTop: "auto",
        }}
      >
        <span
          className="pill"
          style={{
            background: isActive ? "var(--accent-soft)" : "var(--surface-2)",
            color: isActive ? "var(--accent)" : "var(--text-secondary)",
          }}
        >
          <span className="dot" />
          {statusLabel}
        </span>
        <span className="cell-sub">Started {formatDate(ad.firstSeenAt)}</span>
      </div>
    </article>
  );
}

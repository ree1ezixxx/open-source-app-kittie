import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { FilterGroup, SubLabel } from "../components/FilterGroup";
import { Pagination } from "../components/Pagination";
import { Pills, TogglePill } from "../components/Pills";
import { RangeFilter } from "../components/RangeFilter";
import { Tabs } from "../components/Tabs";
import { listApps } from "../lib/api";
import type { Theme } from "../lib/theme";
import { IconClose, IconFilter, IconMoon, IconSearch, IconSun, IconVideo } from "../icons";

/**
 * Organic Content — apps with creator (TikTok/Instagram) videos.
 *
 * Truth (`/dashboard/organic`) groups results BY APP: each app section shows its
 * stats (revenue/installs/released) + a strip of creator-video cards (platform,
 * caption, @handle). The creator-video feed is NOT ingested yet (data-blocked, same
 * class as Meta ads), so we ship the full rail + header shell and an honest empty
 * state rather than fabricating videos. Rail parity mirrors AdsLibraryPage.
 */

type SortOrder = "asc" | "desc";
type Range = { min?: number; max?: number };

// Truth's "ad languages" facet. Our organic feed carries no language column yet,
// so this is rail parity only (matches the Ads lane's approach).
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

export function OrganicPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [selectedApp, setSelectedApp] = useState<{ id: string; title: string } | null>(null);
  const [appQuery, setAppQuery] = useState("");
  const [appOptions, setAppOptions] = useState<{ id: string; title: string }[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [allCats, setAllCats] = useState<string[]>([]);
  const [langs, setLangs] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<Range>({});
  const [mrr, setMrr] = useState<Range>({});
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [searchInput, setSearchInput] = useState("");

  // Category options come from the apps index, like Ads/Explore.
  useEffect(() => {
    listApps({ limit: 100 })
      .then((res) => {
        const set = new Set<string>();
        for (const a of res.data) if (a.category) set.add(a.category);
        setAllCats([...set].sort());
      })
      .catch(() => {});
  }, []);

  // App picker suggestions, debounced.
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

  const scrollRef = useRef<HTMLDivElement>(null);

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
    setSortOrder("desc");
  }

  return (
    <main className="main">
      <header className="topbar">
        <div className="topbar-row">
          <div className="page-title-wrap">
            <div className="page-icon">
              <IconVideo style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h1 className="page-title">Organic Content</h1>
              <div className="page-sub">Browse apps with creator videos</div>
            </div>
            <span className="count-chip">0</span>
          </div>

          <div className="topbar-spacer" />

          <div className="search">
            <IconSearch />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search apps…"
              spellCheck={false}
            />
          </div>

          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
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

            <FilterGroup label="Sort" defaultOpen active={false}>
              <SubLabel>Sort by</SubLabel>
              <Pills<"indexed">
                value="indexed"
                onSelect={() => {}}
                options={[{ id: "indexed", label: "Newest indexed" }]}
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

        <div className="explore-main">
          <div
            style={{
              padding: "0 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Tabs items={[{ id: "all", label: "All", count: 0 }]} active="all" onChange={() => {}} />
            <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Showing 0 of 0 apps</span>
          </div>

          <div className="table-scroll" ref={scrollRef}>
            <EmptyState
              icon={<IconVideo />}
              title="No creator videos yet"
              sub="Organic Content surfaces TikTok & Instagram creator videos per app. Once the creator-video feed is ingested, apps and their videos will show up here."
              action={
                activeCount > 0 ? (
                  <button className="btn" onClick={clearAll}>
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          </div>

          <div className="pager-bottom">
            <Pagination
              page={0}
              totalPages={1}
              total={0}
              count={0}
              pageSize={10}
              loading={false}
              hasPrev={false}
              hasNext={false}
              onPrev={() => {}}
              onNext={() => {}}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

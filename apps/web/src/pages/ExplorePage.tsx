import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AppSortField } from "@kittie/types";
import { Topbar } from "../components/Topbar";
import { AppTable } from "../components/AppTable";
import { ExploreFilterRail } from "../components/ExploreFilterRail";
import { ActiveFilters } from "../components/ActiveFilters";
import { Pagination } from "../components/Pagination";
import { useApps } from "../hooks/useApps";
import { listApps } from "../lib/api";
import {
  activeChips,
  EMPTY_FILTERS,
  parseFilters,
  toApiParams,
  writeFilters,
  type Chip,
  type ExploreFilters,
} from "../lib/exploreFilters";
import type { Theme } from "../lib/theme";
import { IconSearch } from "../icons";

export function ExplorePage({
  theme,
  onToggleTheme,
  onTotal,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onTotal: (n: number) => void;
}) {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const spStr = sp.toString();

  const filters = useMemo<ExploreFilters>(() => parseFilters(sp), [spStr]);
  const apiParams = useMemo(() => toApiParams(filters), [spStr]);

  const [searchInput, setSearchInput] = useState(filters.q);
  const [categories, setCategories] = useState<string[]>([]);

  // apply a partial filter change → URL (replace, so filter tweaks don't spam history).
  // functional updater reads the *latest* params, so rapid successive clicks compose
  // instead of clobbering each other.
  function patch(p: Partial<ExploreFilters>) {
    setSp((prev) => writeFilters({ ...parseFilters(prev), ...p }), { replace: true });
  }

  // debounce search input → q
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== filters.q) patch({ q: searchInput.trim() });
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // keep input in sync if q changes externally (chip clear, back nav)
  useEffect(() => {
    setSearchInput(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  useEffect(() => {
    listApps({ limit: 100 })
      .then((res) => {
        const set = new Set<string>();
        for (const a of res.data) if (a.category) set.add(a.category);
        setCategories([...set].sort());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".search input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { apps, total, page, totalPages, pageSize, loading, error, hasNext, hasPrev, next, prev, refresh } =
    useApps(apiParams);

  useEffect(() => {
    onTotal(total);
  }, [total, onTotal]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  function handleSort(field: AppSortField) {
    if (filters.sort === field) patch({ order: filters.order === "desc" ? "asc" : "desc" });
    else patch({ sort: field, order: "desc" });
  }

  function clearFilters() {
    setSp((prev) => writeFilters({ ...EMPTY_FILTERS, q: parseFilters(prev).q }), { replace: true });
  }

  function clearAll() {
    setSearchInput("");
    setSp(new URLSearchParams(), { replace: true });
  }

  function clearChip(chip: Chip) {
    patch(chip.clear);
  }

  function exportRows(format: "csv" | "json") {
    if (apps.length === 0) return;
    let blob: Blob;
    if (format === "json") {
      blob = new Blob([JSON.stringify(apps, null, 2)], { type: "application/json;charset=utf-8" });
    } else {
      const cols: [string, (a: (typeof apps)[number]) => string | number][] = [
        ["Title", (a) => a.title],
        ["Developer", (a) => a.developer],
        ["Store", (a) => a.store],
        ["Category", (a) => a.category ?? ""],
        ["Rating", (a) => a.rating ?? ""],
        ["Reviews", (a) => a.reviewCount],
        ["Downloads30d", (a) => a.downloadsEstimate30d ?? ""],
        ["Revenue30d", (a) => a.revenueEstimate30d ?? ""],
        ["GrowthScore", (a) => a.growthScore ?? ""],
        ["Released", (a) => a.releasedAt ?? ""],
        ["Updated", (a) => a.updatedAt ?? ""],
      ];
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const rows = [
        cols.map((c) => c[0]).join(","),
        ...apps.map((a) => cols.map((c) => esc(c[1](a))).join(",")),
      ];
      blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kittie-explore-export.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const chips = activeChips(filters);

  return (
    <main className="main">
      <Topbar
        title="Explore Apps"
        subtitle="Search and filter the app database"
        total={total}
        loading={loading}
        theme={theme}
        onToggleTheme={onToggleTheme}
        search={searchInput}
        onSearch={setSearchInput}
        onRefresh={refresh}
        onExportCsv={() => exportRows("csv")}
        onExportJson={() => exportRows("json")}
      />

      <div className="rail-layout">
        <ExploreFilterRail
          filters={filters}
          categories={categories}
          onPatch={patch}
          onClear={clearFilters}
        />

        <div className="explore-main">
          <div className="explore-bar">
            <ActiveFilters
              chips={chips}
              query={filters.q}
              onClearChip={clearChip}
              onClearSearch={() => setSearchInput("")}
              onClearAll={clearAll}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              count={apps.length}
              pageSize={pageSize}
              loading={loading}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={prev}
              onNext={next}
            />
          </div>

          <div className="table-scroll" ref={scrollRef}>
            {error ? (
              <div className="center-state">
                <IconSearch />
                <div className="title">Couldn’t load apps</div>
                <div className="sub">{error}. Make sure the API is running on port 3007.</div>
                <button className="btn" onClick={refresh}>Retry</button>
              </div>
            ) : !loading && apps.length === 0 ? (
              <div className="center-state">
                <IconSearch />
                <div className="title">No apps match these filters</div>
                <div className="sub">Try widening a range or clearing a filter from the rail.</div>
                {chips.length > 0 && (
                  <button className="btn" onClick={clearFilters}>Clear filters</button>
                )}
              </div>
            ) : (
              <>
                <AppTable
                  apps={apps}
                  loading={loading}
                  sortBy={filters.sort}
                  sortOrder={filters.order}
                  onSort={handleSort}
                  onSelect={(id) => navigate(`/apps/${encodeURIComponent(id)}`)}
                  startRank={page * pageSize}
                />
                {total > pageSize && (
                  <div className="pager-bottom">
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      total={total}
                      count={apps.length}
                      pageSize={pageSize}
                      loading={loading}
                      hasPrev={hasPrev}
                      hasNext={hasNext}
                      onPrev={prev}
                      onNext={next}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

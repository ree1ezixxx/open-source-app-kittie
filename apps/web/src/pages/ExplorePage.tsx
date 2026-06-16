import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AppSortField } from "@kittie/types";
import { Topbar } from "../components/Topbar";
import { AppTable } from "../components/AppTable";
import { ExploreFilterRail, type CategoryMode } from "../components/ExploreFilterRail";
import { ActiveFilters } from "../components/ActiveFilters";
import { Pagination } from "../components/Pagination";
import { useApps } from "../hooks/useApps";
import { listCategories, type CategoryFacet } from "../lib/api";
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

  // Rail extras that live outside ExploreFilters (URL stays the single source
  // of truth): category include/exclude mode + app-language multi-select.
  const catMode: CategoryMode = sp.get("catmode") === "exclude" ? "exclude" : "include";
  const langs = useMemo(() => sp.get("langs")?.split(",").filter(Boolean) ?? [], [spStr]);

  const apiParams = useMemo(() => {
    const base = toApiParams(filters);
    if (catMode === "exclude" && base.categories) {
      base.excludedCategories = base.categories;
      base.categories = undefined;
    }
    if (langs.length) base.languages = langs.join(",");
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spStr]);

  const [searchInput, setSearchInput] = useState(filters.q);
  const [categories, setCategories] = useState<CategoryFacet[]>([]);

  // apply a partial filter change → URL (replace, so filter tweaks don't spam history).
  // functional updater reads the *latest* params, so rapid successive clicks compose
  // instead of clobbering each other. writeFilters only knows ExploreFilters keys, so
  // the extra rail params are carried over from prev (or overridden via `extras`).
  const EXTRA_KEYS = ["catmode", "langs"] as const;
  function patch(
    p: Partial<ExploreFilters>,
    extras?: Partial<Record<(typeof EXTRA_KEYS)[number], string | undefined>>,
  ) {
    setSp(
      (prev) => {
        const next = writeFilters({ ...parseFilters(prev), ...p });
        for (const k of EXTRA_KEYS) {
          const v = extras && k in extras ? extras[k] : (prev.get(k) ?? undefined);
          if (v) next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
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
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
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
    if (chip.id === "langs") return patch({}, { langs: undefined });
    if (chip.id === "cats") return patch(chip.clear, { catmode: undefined });
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

  const chips: Chip[] = activeChips(filters).map((c) =>
    c.id === "cats" && catMode === "exclude" ? { ...c, label: `Exclude: ${c.label}` } : c,
  );
  if (langs.length) {
    chips.push({
      id: "langs",
      label: langs.length === 1 ? `Language: ${langs[0]!.toUpperCase()}` : `${langs.length} languages`,
      clear: {},
    });
  }

  return (
    <main className="main">
      <Topbar
        title="Explore Apps"
        subtitle="Search and filter"
        total={total}
        showing={apps.length}
        loading={loading}
        theme={theme}
        onToggleTheme={onToggleTheme}
        search={searchInput}
        onSearch={setSearchInput}
        searchScope={filters.scope}
        onSearchScope={(scope) => patch({ scope })}
        onRefresh={refresh}
        onExportCsv={() => exportRows("csv")}
        onExportJson={() => exportRows("json")}
      />

      <div className="rail-layout">
        <ExploreFilterRail
          filters={filters}
          categories={categories}
          catMode={catMode}
          onCatMode={(m) => patch({}, { catmode: m === "exclude" ? "exclude" : undefined })}
          langs={langs}
          onLangs={(next) => patch({}, { langs: next.length ? next.join(",") : undefined })}
          onPatch={patch}
          onClear={clearFilters}
        />

        <div className="explore-main">
          <div className="explore-bar">
            {chips.length > 0 && (
              <span className="cell-sub" style={{ flex: "none", whiteSpace: "nowrap" }}>
                {chips.length} filter{chips.length === 1 ? "" : "s"} active
              </span>
            )}
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
                <div className="sub">{error}. Start the API server and retry.</div>
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

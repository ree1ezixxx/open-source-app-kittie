import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  AppSearchParams,
  AppSortField,
  GrowthPeriod,
  SortOrder,
  Store,
} from "@kittie/types";
import { Topbar } from "../components/Topbar";
import { AppTable } from "../components/AppTable";
import { useApps } from "../hooks/useApps";
import { listApps } from "../lib/api";
import type { Theme } from "../lib/theme";
import { IconSearch } from "../icons";

const VIEW_META: Record<string, { title: string; subtitle: string }> = {
  database: { title: "Explore Apps", subtitle: "Search and filter the app database" },
  trending: { title: "Trending", subtitle: "Apps with the strongest momentum" },
  rising: { title: "Rising", subtitle: "Fast-growing newcomers" },
};

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

  const view = sp.get("view") || "database";
  const source = (sp.get("source") as Store | null) || undefined;
  const category = sp.get("category") || "";
  const sortBy = (sp.get("sort") as AppSortField | null) || "revenue";
  const sortOrder = (sp.get("order") as SortOrder | null) || "desc";
  const growthPeriod = (sp.get("period") as GrowthPeriod | null) || "7d";
  const qParam = sp.get("q") || "";

  const [searchInput, setSearchInput] = useState(qParam);
  const [categories, setCategories] = useState<string[]>([]);

  // filter changes replace history (no back-button spam); only detail nav pushes
  function update(mut: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(sp);
    mut(next);
    setSp(next, { replace: true });
  }

  // debounce search input → q param
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== qParam) {
        update((p) => {
          if (searchInput.trim()) p.set("q", searchInput.trim());
          else p.delete("q");
        });
      }
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // keep input in sync if q changes externally (e.g. back navigation)
  useEffect(() => {
    setSearchInput(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

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

  const effectiveSort: AppSortField =
    view === "trending" ? "trending" : view === "rising" ? "growth" : sortBy;

  const params = useMemo<AppSearchParams>(
    () => ({
      search: qParam || undefined,
      source,
      categories: category || undefined,
      sortBy: effectiveSort,
      sortOrder,
      growthPeriod,
      growthType: view === "rising" ? "positive" : undefined,
    }),
    [qParam, source, category, effectiveSort, sortOrder, growthPeriod, view],
  );

  const { apps, total, loading, loadingMore, error, hasMore, loadMore, refresh } = useApps(params);

  useEffect(() => {
    onTotal(total);
  }, [total, onTotal]);

  function handleSort(field: AppSortField) {
    update((p) => {
      if (view !== "database") p.delete("view");
      if (sortBy === field && view === "database") {
        p.set("order", sortOrder === "desc" ? "asc" : "desc");
      } else {
        p.set("sort", field);
        p.set("order", "desc");
      }
    });
  }

  function handleExport() {
    if (apps.length === 0) return;
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
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kittie-${view}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const meta = VIEW_META[view] ?? VIEW_META.database!;

  return (
    <main className="main">
      <Topbar
        title={meta.title}
        subtitle={meta.subtitle}
        total={total}
        shown={apps.length}
        loading={loading}
        theme={theme}
        onToggleTheme={onToggleTheme}
        search={searchInput}
        onSearch={setSearchInput}
        source={source}
        onSource={(s) => update((p) => (s ? p.set("source", s) : p.delete("source")))}
        category={category}
        categories={categories}
        onCategory={(c) => update((p) => (c ? p.set("category", c) : p.delete("category")))}
        sortBy={effectiveSort}
        onSortBy={(s) =>
          update((p) => {
            p.delete("view");
            p.set("sort", s);
          })
        }
        growthPeriod={growthPeriod}
        onGrowthPeriod={(pp) => update((p) => p.set("period", pp))}
        onRefresh={refresh}
        onExport={handleExport}
      />

      <div className="table-scroll">
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
            <div className="sub">Try clearing the search or switching stores.</div>
          </div>
        ) : (
          <>
            <AppTable
              apps={apps}
              loading={loading}
              sortBy={effectiveSort}
              sortOrder={sortOrder}
              onSort={handleSort}
              onSelect={(id) => navigate(`/apps/${encodeURIComponent(id)}`)}
            />
            {hasMore && !loading && (
              <div className="load-more-wrap">
                <button className="btn" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

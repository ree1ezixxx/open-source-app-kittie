import type { AppSortField, GrowthPeriod, Store } from "@kittie/types";
import {
  IconSearch,
  IconSun,
  IconMoon,
  IconDownload,
  IconRefresh,
  IconChevron,
  IconApple,
  IconGooglePlay,
  IconGrid,
} from "../icons";
import type { Theme } from "../lib/theme";

const SORTS: { value: AppSortField; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "downloads", label: "Downloads" },
  { value: "reviews", label: "Reviews" },
  { value: "rating", label: "Rating" },
  { value: "growth", label: "Growth" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently updated" },
];

const PERIODS: GrowthPeriod[] = ["7d", "14d", "30d", "60d", "90d"];

// Revenue floors (monthly $) — the "is this worth cloning?" demand gate.
const REVENUE_FLOORS: { value: number; label: string }[] = [
  { value: 10_000, label: "$10k/mo" },
  { value: 25_000, label: "$25k/mo" },
  { value: 50_000, label: "$50k/mo" },
  { value: 100_000, label: "$100k/mo" },
  { value: 250_000, label: "$250k/mo" },
  { value: 500_000, label: "$500k/mo" },
];

// Rating ceilings — surface the under-served, beatable apps.
const RATING_CEILINGS: { value: number; label: string }[] = [
  { value: 2.0, label: "≤ 2.0★" },
  { value: 2.5, label: "≤ 2.5★" },
  { value: 3.0, label: "≤ 3.0★" },
  { value: 3.5, label: "≤ 3.5★" },
  { value: 4.0, label: "≤ 4.0★" },
];

export function Topbar({
  title,
  subtitle,
  total,
  shown,
  loading,
  theme,
  onToggleTheme,
  search,
  onSearch,
  source,
  onSource,
  category,
  categories,
  onCategory,
  sortBy,
  onSortBy,
  minRevenue,
  onMinRevenue,
  maxRating,
  onMaxRating,
  onLowHangingFruit,
  growthPeriod,
  onGrowthPeriod,
  onRefresh,
  onExport,
}: {
  title: string;
  subtitle: string;
  total: number;
  shown: number;
  loading: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  search: string;
  onSearch: (v: string) => void;
  source: Store | undefined;
  onSource: (s: Store | undefined) => void;
  category: string;
  categories: string[];
  onCategory: (c: string) => void;
  sortBy: AppSortField;
  onSortBy: (s: AppSortField) => void;
  minRevenue: number | undefined;
  onMinRevenue: (v: number | undefined) => void;
  maxRating: number | undefined;
  onMaxRating: (v: number | undefined) => void;
  onLowHangingFruit: () => void;
  growthPeriod: GrowthPeriod;
  onGrowthPeriod: (p: GrowthPeriod) => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  return (
    <div className="topbar">
      <div className="topbar-row">
        <div className="page-title-wrap">
          <div className="page-icon">
            <IconGrid style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <div className="page-title">{title}</div>
            <div className="page-sub">{subtitle}</div>
          </div>
          <span className="count-chip">{total.toLocaleString()}</span>
        </div>

        <div className="topbar-spacer" />

        <div className="search">
          <IconSearch />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search apps, developers…"
            spellCheck={false}
          />
          <span className="kbd">⌘K</span>
        </div>

        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh" title="Refresh">
          <IconRefresh style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
        <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        <button className="btn" onClick={onExport} title="Export current view to CSV">
          <IconDownload /> Export
        </button>
      </div>

      <div className="toolbar">
        <button
          className="btn btn-accent"
          onClick={onLowHangingFruit}
          title="High revenue, low rating — worst-rated first. The clone-it sift. (≥ $25k/mo on seed data; target is $50k once real revenue lands.)"
        >
          🍒 Low-hanging fruit
        </button>

        <div className="segmented">
          <button className={source === undefined ? "on" : ""} onClick={() => onSource(undefined)}>
            All
          </button>
          <button className={source === "apple" ? "on" : ""} onClick={() => onSource("apple")}>
            <IconApple /> App Store
          </button>
          <button className={source === "google" ? "on" : ""} onClick={() => onSource("google")}>
            <IconGooglePlay /> Google Play
          </button>
        </div>

        <div className="select">
          <select value={category} onChange={(e) => onCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="toolbar-divider" />

        <div className="select">
          <select
            value={minRevenue ?? ""}
            onChange={(e) => onMinRevenue(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Revenue: any</option>
            {REVENUE_FLOORS.map((r) => (
              <option key={r.value} value={r.value}>{`Revenue ≥ ${r.label}`}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="select">
          <select
            value={maxRating ?? ""}
            onChange={(e) => onMaxRating(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Rating: any</option>
            {RATING_CEILINGS.map((r) => (
              <option key={r.value} value={r.value}>{`Rating ${r.label}`}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="select">
          <select value={sortBy} onChange={(e) => onSortBy(e.target.value as AppSortField)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>Sort: {s.label}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="select">
          <select value={growthPeriod} onChange={(e) => onGrowthPeriod(e.target.value as GrowthPeriod)}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>Growth: {p}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="toolbar-meta">
          {loading ? "Loading…" : `Showing ${shown.toLocaleString()} of ${total.toLocaleString()}`}
        </div>
      </div>
    </div>
  );
}

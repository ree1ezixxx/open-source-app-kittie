import { useState } from "react";
import {
  IconSearch,
  IconSun,
  IconMoon,
  IconDownload,
  IconRefresh,
  IconChevron,
  IconGrid,
} from "../icons";
import { formatCompact } from "../lib/format";
import type { Theme } from "../lib/theme";

const SEARCH_SCOPES = ["All", "Title", "Developer", "Description"] as const;
type SearchScope = (typeof SEARCH_SCOPES)[number];

/** Explore header strip — title, search (+ scope), refresh, theme, export. Filters live in the rail. */
export function Topbar({
  title,
  subtitle,
  total,
  showing,
  loading,
  theme,
  onToggleTheme,
  search,
  onSearch,
  onRefresh,
  onExportCsv,
  onExportJson,
}: {
  title: string;
  subtitle: string;
  total: number;
  /** Rows on the current page — renders "Showing 50 of 2.7K apps" when set. */
  showing?: number;
  loading: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  search: string;
  onSearch: (v: string) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  // The REST API has no field-scope param yet — every scope searches All under
  // the hood; non-All options are visual with a tooltip saying so.
  const [scope, setScope] = useState<SearchScope>("All");

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
          <span className="count-chip" title={`${total.toLocaleString()} apps`}>
            {showing != null
              ? `Showing ${showing.toLocaleString()} of ${formatCompact(total)} apps`
              : total.toLocaleString()}
          </span>
        </div>

        <div className="topbar-spacer" />

        <div className="search">
          <IconSearch />
          <input
            className="search-input"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search apps, developers, descriptions..."
            spellCheck={false}
          />
          <span className="kbd">⌘K</span>
        </div>

        <div className="export-wrap" onMouseLeave={() => setScopeOpen(false)}>
          <button
            className="btn"
            onClick={() => setScopeOpen((o) => !o)}
            title="Search field scope"
            aria-haspopup="menu"
            aria-expanded={scopeOpen}
          >
            Search in: {scope} <IconChevron />
          </button>
          {scopeOpen && (
            <div className="export-menu" role="menu">
              {SEARCH_SCOPES.map((s) => (
                <button
                  key={s}
                  role="menuitem"
                  title={s === "All" ? undefined : "Field scoping coming soon — searches All for now"}
                  style={s === scope ? { color: "var(--accent)" } : undefined}
                  onClick={() => {
                    setScope(s);
                    setScopeOpen(false);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh" title="Refresh">
          <IconRefresh style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
        <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>

        <div className="export-wrap" onMouseLeave={() => setExportOpen(false)}>
          <button className="btn" onClick={() => setExportOpen((o) => !o)} title="Export current view">
            <IconDownload /> Export <IconChevron />
          </button>
          {exportOpen && (
            <div className="export-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  onExportCsv();
                  setExportOpen(false);
                }}
              >
                Export as CSV
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  onExportJson();
                  setExportOpen(false);
                }}
              >
                Export as JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

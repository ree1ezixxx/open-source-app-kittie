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
import type { Theme } from "../lib/theme";

/** Explore header strip — title, search, refresh, theme, export. Filters live in the rail. */
export function Topbar({
  title,
  subtitle,
  total,
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
            className="search-input"
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

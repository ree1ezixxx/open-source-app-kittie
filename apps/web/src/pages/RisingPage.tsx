import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Store, GrowthPeriod } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { useApps } from "../hooks/useApps";
import { AppIcon } from "../components/AppIcon";
import { formatCompact, formatMoney } from "../lib/format";
import { IconRising, IconChart, IconCheck, IconClose, IconFilter, IconRefresh } from "../icons";
import type { Theme } from "../lib/theme";

type Launched = "3M" | "6M" | "1Y";
type Signal = "2W" | "1M" | "3M";

const LAUNCH_DAYS: Record<Launched, number> = { "3M": 90, "6M": 180, "1Y": 365 };
const SIGNAL_PERIOD: Record<Signal, GrowthPeriod> = { "2W": "14d", "1M": "30d", "3M": "90d" };

/** Live parity — country picker entries shown as "🇨🇳 China (Chinese (Simplified))". */
const COUNTRIES: { code: string; flag: string; name: string; language: string }[] = [
  { code: "US", flag: "🇺🇸", name: "United States", language: "English" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom", language: "English" },
  { code: "CN", flag: "🇨🇳", name: "China", language: "Chinese (Simplified)" },
  { code: "JP", flag: "🇯🇵", name: "Japan", language: "Japanese" },
  { code: "KR", flag: "🇰🇷", name: "South Korea", language: "Korean" },
  { code: "DE", flag: "🇩🇪", name: "Germany", language: "German" },
  { code: "FR", flag: "🇫🇷", name: "France", language: "French" },
  { code: "ES", flag: "🇪🇸", name: "Spain", language: "Spanish" },
  { code: "IT", flag: "🇮🇹", name: "Italy", language: "Italian" },
  { code: "BR", flag: "🇧🇷", name: "Brazil", language: "Portuguese" },
  { code: "MX", flag: "🇲🇽", name: "Mexico", language: "Spanish" },
  { code: "IN", flag: "🇮🇳", name: "India", language: "English" },
  { code: "CA", flag: "🇨🇦", name: "Canada", language: "English" },
  { code: "AU", flag: "🇦🇺", name: "Australia", language: "English" },
];

const CATEGORIES: { name: string; emoji: string }[] = [
  { name: "Business", emoji: "💼" },
  { name: "Education", emoji: "🎓" },
  { name: "Entertainment", emoji: "🎬" },
  { name: "Finance", emoji: "💰" },
  { name: "Food & Drink", emoji: "🍔" },
  { name: "Games", emoji: "🎮" },
  { name: "Health & Fitness", emoji: "💪" },
  { name: "Lifestyle", emoji: "🌿" },
  { name: "Music", emoji: "🎵" },
  { name: "Photo & Video", emoji: "📷" },
  { name: "Productivity", emoji: "⚡" },
  { name: "Shopping", emoji: "🛍️" },
  { name: "Social Networking", emoji: "💬" },
  { name: "Travel", emoji: "✈️" },
  { name: "Utilities", emoji: "🔧" },
];

/* ============================================================ persisted filter state */

interface RisingState {
  launched: Launched;
  signal: Signal;
  /** Absent = both stores combined (truth default). Set = filter to one store. */
  store?: Store;
  /** Truth parity — filters EXCLUDE selected markets/categories, not narrow to them. */
  excludedCountries: string[];
  excludedCats: string[];
}

const DEFAULT_STATE: RisingState = { launched: "6M", signal: "1M", excludedCountries: [], excludedCats: [] };
const LS_KEY = "kittie.rising.filters.v2";

/** Live parity — "Filters apply to all data and persist across sessions". */
function loadState(): RisingState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE;
    const p = JSON.parse(raw) as Partial<RisingState>;
    return {
      launched: p.launched === "3M" || p.launched === "1Y" ? p.launched : "6M",
      signal: p.signal === "2W" || p.signal === "3M" ? p.signal : "1M",
      store: p.store === "google" ? "google" : p.store === "apple" ? "apple" : undefined,
      excludedCountries: Array.isArray(p.excludedCountries)
        ? p.excludedCountries.filter((c) => COUNTRIES.some((x) => x.code === c))
        : [],
      excludedCats: Array.isArray(p.excludedCats)
        ? p.excludedCats.filter((c) => CATEGORIES.some((x) => x.name === c))
        : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

/* ============================================================ filters popover */

const popItemStyle = (on: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  padding: "6px 8px",
  borderRadius: 7,
  border: "none",
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--text)",
  background: on ? "var(--accent-soft)" : "none",
});

function FilterList({
  label,
  items,
  selected,
  onToggle,
  disabledIds,
  disabledTitle,
}: {
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Items rendered greyed + un-clickable (e.g. markets with no ingested data). */
  disabledIds?: Set<string>;
  disabledTitle?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="filter-label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map((it) => {
          const on = selected.includes(it.id);
          const disabled = disabledIds?.has(it.id) ?? false;
          return (
            <button
              key={it.id}
              style={{ ...popItemStyle(on), ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : null) }}
              onClick={() => !disabled && onToggle(it.id)}
              disabled={disabled}
              title={disabled ? disabledTitle : undefined}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.label}
              </span>
              {on && <IconCheck style={{ width: 13, height: 13, color: "var(--accent)", flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ page */

export function RisingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const nav = useNavigate();
  const [state, setState] = useState<RisingState>(loadState);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { launched, signal, store, excludedCountries, excludedCats } = state;

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — filters just won't persist */
    }
  }, [state]);

  const patch = (p: Partial<RisingState>) => setState((s) => ({ ...s, ...p }));
  const toggleIn = (key: "excludedCountries" | "excludedCats", id: string) =>
    setState((s) => ({
      ...s,
      [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id],
    }));

  const releasedAfter = useMemo(
    () => Math.floor((Date.now() - LAUNCH_DAYS[launched] * 86_400_000) / 1000),
    [launched],
  );

  const { apps, total, loading, refresh } = useApps({
    sortBy: "revenue",
    growthType: "positive",
    sortOrder: "desc",
    growthPeriod: SIGNAL_PERIOD[signal],
    source: store,
    releasedAfter,
    excludedCategories: excludedCats.length ? excludedCats.join(",") : undefined,
    excludedCountries: excludedCountries.length ? excludedCountries.join(",") : undefined,
    limit: 100,
  });

  const activeFilterCount = excludedCountries.length + excludedCats.length;

  const exploreHref = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("sortBy", "revenue");
    sp.set("sortOrder", "desc");
    sp.set("secondarySortBy", "growth");
    sp.set("secondarySortOrder", "desc");
    sp.set("growthPeriod", SIGNAL_PERIOD[signal]);
    sp.set("gtype", "positive");
    sp.set("releasedAfter", "custom");
    sp.set("releasedAfterDate", new Date(releasedAfter * 1000).toISOString().slice(0, 10));
    if (store) sp.set("source", store);
    if (excludedCountries.length) sp.set("excludedCountries", excludedCountries.join(","));
    if (excludedCats.length) sp.set("excludedCategories", excludedCats.join(","));
    return `/dashboard/explore?${sp.toString()}`;
  }, [signal, store, releasedAfter, excludedCountries, excludedCats]);

  const toolbar = (
    <div className="toolbar">
      <span className="filter-label" style={{ alignSelf: "center" }}>Launched</span>
      <Segmented<Launched> value={launched} onChange={(v) => patch({ launched: v })} options={[{ id: "3M", label: "3M" }, { id: "6M", label: "6M" }, { id: "1Y", label: "1Y" }]} />
      <span className="filter-label" style={{ alignSelf: "center" }}>Growth signal</span>
      <Segmented<Signal> value={signal} onChange={(v) => patch({ signal: v })} options={[{ id: "2W", label: "2W" }, { id: "1M", label: "1M" }, { id: "3M", label: "3M" }]} />
      <div className="toolbar-divider" />
      <div className="segmented">
        <button
          type="button"
          className={store === "apple" ? "on" : ""}
          onClick={() => patch({ store: store === "apple" ? undefined : "apple" })}
        >
          Apple Store
        </button>
        <button
          type="button"
          className={store === "google" ? "on" : ""}
          onClick={() => patch({ store: store === "google" ? undefined : "google" })}
        >
          Google Play
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <button className="btn" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          <IconFilter />
          Filters
          {activeFilterCount > 0 && (
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                minWidth: 17,
                height: 17,
                padding: "0 5px",
                borderRadius: 99,
                background: "var(--accent)",
                color: "var(--accent-ink)",
                fontSize: 10.5,
                fontWeight: 700,
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
        {filtersOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setFiltersOpen(false)} />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 30,
                width: 480,
                maxWidth: "min(480px, 92vw)",
                padding: 12,
                borderRadius: 12,
                background: "var(--panel)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-pop)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <FilterList
                label="Country (exclude)"
                items={COUNTRIES.map((c) => ({ id: c.code, label: `${c.flag} ${c.name} (${c.language})` }))}
                selected={excludedCountries}
                onToggle={(id) => toggleIn("excludedCountries", id)}
              />
              <FilterList
                label="Category (exclude)"
                items={CATEGORIES.map((c) => ({ id: c.name, label: `${c.emoji} ${c.name}` }))}
                selected={excludedCats}
                onToggle={(id) => toggleIn("excludedCats", id)}
              />
            </div>
          </>
        )}
      </div>

      <Link className="btn" to={exploreHref} style={{ marginLeft: "auto" }}>View in Explore</Link>

      <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--text-tertiary)" }}>
        Filters apply to all data and persist across sessions
      </div>
      {activeFilterCount > 0 && (
        <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--text-tertiary)" }}>
          {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
        </div>
      )}

      {activeFilterCount > 0 && (
        <div className="active-filters" style={{ flexBasis: "100%" }}>
          {excludedCountries.map((code) => {
            const c = COUNTRIES.find((x) => x.code === code)!;
            return (
              <button key={code} className="achip" onClick={() => toggleIn("excludedCountries", code)}>
                {c.name} ({c.language})
                <IconClose />
              </button>
            );
          })}
          {excludedCats.map((name) => {
            const c = CATEGORIES.find((x) => x.name === name)!;
            return (
              <button key={name} className="achip" onClick={() => toggleIn("excludedCats", name)}>
                {c.name}
                <IconClose />
              </button>
            );
          })}
          <button className="achip-clear" onClick={() => patch({ excludedCountries: [], excludedCats: [] })}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );

  return (
    <PageShell
      icon={<IconRising />}
      title="Rising Apps"
      sub="Discover apps with accelerating monthly recurring revenue"
      count={<span className="count-chip">Top {Math.min(total || apps.length, 100)} apps</span>}
      actions={
        <button className="icon-btn" onClick={refresh} aria-label="Refresh" title="Refresh">
          <IconRefresh style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
      }
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={toolbar}
      bodyClass="flush"
    >
      <div className="table-scroll">
        {loading ? (
          <EmptyState icon={<IconChart />} title="Loading rising apps…" />
        ) : !apps.length ? (
          <EmptyState
            icon={<IconChart />}
            title="No rising apps in this window"
            sub="Growth signal needs 2+ days of snapshots to rank acceleration — widen the window or check back once the baseline lands."
          />
        ) : (
          <table className="apps">
            <thead>
              <tr>
                <th className="num" style={{ width: 56 }}>Rank</th>
                <th className="col-app">App</th>
                <th className="num">MRR</th>
                <th className="num">Growth</th>
                <th className="num">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {apps.slice(0, 100).map((a, i) => {
                const d = a.growthPct;
                return (
                  <tr key={a.id} onClick={() => nav(`/apps/${a.id}`)}>
                    {/* Truth prefixes ranks 4+ with "#"; 1–3 stay plain. */}
                    <td className="num num-strong">{i < 3 ? i + 1 : `#${i + 1}`}</td>
                    <td className="col-app">
                      <div className="app-cell">
                        <AppIcon url={a.iconUrl} title={a.title} />
                        <div className="app-meta">
                          <div className="app-title" title={a.title}>{a.title}</div>
                          <div className="app-dev">
                            {a.category ? `${a.category} · ${a.developer}` : a.developer}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num num-strong">{formatMoney(a.revenueEstimate30d)}</td>
                    <td className="num">
                      {d != null ? (
                        <span className={`delta ${d >= 0 ? "up" : "down"}`}>{d >= 0 ? "+" : ""}{d.toFixed(1)}%</span>
                      ) : (
                        <span className="num-muted">—</span>
                      )}
                    </td>
                    <td className="num num-strong">{formatCompact(a.downloadsEstimate30d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}

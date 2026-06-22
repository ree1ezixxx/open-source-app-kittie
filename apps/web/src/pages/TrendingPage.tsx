import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChartType, Store, TopChartsResult } from "@kittie/types";
import { AppIcon } from "../components/AppIcon";
import { PageShell } from "../components/PageShell";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { listCharts } from "../lib/api";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact, formatMoney } from "../lib/format";
import { IconTrending, IconChart } from "../icons";
import type { Theme } from "../lib/theme";

const CATEGORIES: { name: string; icon: string }[] = [
  { name: "All categories", icon: "Categories" },
  { name: "Business", icon: "💼" },
  { name: "Education", icon: "🎓" },
  { name: "Entertainment", icon: "🎬" },
  { name: "Finance", icon: "💰" },
  { name: "Food & Drink", icon: "🍔" },
  { name: "Games", icon: "🎮" },
  { name: "Graphics & Design", icon: "🎨" },
  { name: "Health & Fitness", icon: "💪" },
  { name: "Lifestyle", icon: "🌿" },
  { name: "Music", icon: "🎵" },
  { name: "News", icon: "📰" },
  { name: "Photo & Video", icon: "📷" },
  { name: "Productivity", icon: "⚡" },
  { name: "Shopping", icon: "🛍️" },
  { name: "Social Networking", icon: "💬" },
  { name: "Sports", icon: "🏆" },
  { name: "Travel", icon: "✈️" },
  { name: "Utilities", icon: "🔧" },
  { name: "Weather", icon: "☀️" },
];

// Storefronts offered in the country selector (mirrors truth's control). Only US
// chart data is ingested today; other storefronts render the honest empty-state
// until their feeds are collected — never fabricated rows.
const COUNTRIES: { code: string; flag: string; label: string }[] = [
  { code: "US", flag: "🇺🇸", label: "United States" },
  { code: "GB", flag: "🇬🇧", label: "United Kingdom" },
  { code: "CA", flag: "🇨🇦", label: "Canada" },
  { code: "AU", flag: "🇦🇺", label: "Australia" },
  { code: "DE", flag: "🇩🇪", label: "Germany" },
  { code: "FR", flag: "🇫🇷", label: "France" },
  { code: "JP", flag: "🇯🇵", label: "Japan" },
  { code: "BR", flag: "🇧🇷", label: "Brazil" },
];
const DEFAULT_COUNTRY = COUNTRIES[0]!;
const DEFAULT_CATEGORY = CATEGORIES[0]!;

function chartFreshness(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return `Updated ${date}`;
  return `Updated ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function TrendingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const nav = useNavigate();
  const [chart, setChart] = useState<ChartType>("free");
  const [store, setStore] = useState<Store>("apple");
  const [category, setCategory] = useState("All categories");
  const [country, setCountry] = useState("US");
  const [result, setResult] = useState<TopChartsResult | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by "Refresh rankings" to re-pull the latest snapshot-derived chart.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    listCharts(
      {
        store,
        type: chart,
        country,
        category: category === "All categories" ? undefined : category,
        limit: 100,
      },
      ac.signal,
    )
      .then((r) => setResult(r))
      .catch((e) => {
        if (e?.name !== "AbortError") setResult(null);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [chart, store, category, country, refreshTick]);

  const entries = result?.entries ?? [];
  const updated = chartFreshness(result?.date ?? null);
  const selectedCountry = COUNTRIES.find((c) => c.code === country) ?? DEFAULT_COUNTRY;
  const selectedCategory = CATEGORIES.find((c) => c.name === category) ?? DEFAULT_CATEGORY;

  const toolbar = (
    <div className="toolbar">
      <Segmented<ChartType>
        value={chart}
        onChange={setChart}
        options={[
          { id: "free", label: "Top Free" },
          { id: "paid", label: "Top Paid" },
          { id: "grossing", label: "Top Grossing" },
        ]}
      />
      <Segmented<Store>
        value={store}
        onChange={setStore}
        options={[
          { id: "apple", label: "Apple Store" },
          { id: "google", label: "Google Play" },
        ]}
      />
      <div className="select">
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.label}</option>)}
        </select>
      </div>
      <div className="select">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {CATEGORIES.map((c) => <option key={c.name}>{c.icon} {c.name}</option>)}
        </select>
      </div>
      <button className="btn" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading}>
        Refresh rankings
      </button>
      {updated && <div className="trending-freshness">{updated}</div>}
    </div>
  );

  return (
    <PageShell
      icon={<IconTrending />}
      title="Store Rankings"
      sub="Browse top charts by country and category"
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={toolbar}
      bodyClass="flush"
    >
      <div className="trending-chart-meta" aria-label="Selected chart metadata">
        <span title={selectedCountry.label}>{selectedCountry.flag}</span>
        <span title={selectedCategory.name}>{selectedCategory.icon}</span>
        <span className="trending-chart-dot">•</span>
        <span>{entries.length} {entries.length === 1 ? "app" : "apps"}</span>
      </div>
      <div className="table-scroll">
        {loading ? (
          <EmptyState icon={<IconChart />} title="Loading rankings…" />
        ) : !entries.length ? (
          <EmptyState
            icon={<IconChart />}
            title="No ranking data"
            sub={
              store === "google"
                ? "Google Play chart data isn't ingested yet."
                : country !== "US"
                  ? `${COUNTRIES.find((c) => c.code === country)?.label ?? country} chart data isn't ingested yet.`
                  : "No clean chart for this store / category yet."
            }
          />
        ) : (
          <table className="apps">
            <thead>
              <tr>
                <th className="num" style={{ width: 56 }}>Rank</th>
                <th className="num" style={{ width: 64 }}>24h</th>
                <th className="col-app">App</th>
                <th className="num">Downloads</th>
                <th className="num">MRR</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.app.id} onClick={() => nav(`/apps/${e.app.id}`)}>
                  <td className="num num-strong">{e.rank}</td>
                  <td className="num">
                    {e.rankDelta == null ? (
                      <span className="num-muted">—</span>
                    ) : e.rankDelta === 0 ? (
                      <span className="num-muted">0</span>
                    ) : (
                      <span className={`delta ${e.rankDelta > 0 ? "up" : "down"}`}>
                        {e.rankDelta > 0 ? "+" : "−"}{Math.abs(e.rankDelta)}
                      </span>
                    )}
                  </td>
                  <td className="col-app">
                    <div className="app-cell">
                      <AppIcon url={e.app.iconUrl} title={e.app.title} />
                      <div className="app-meta">
                        <div className="app-title" title={e.app.title}>{e.app.title}</div>
                        {e.app.category && (
                          <div className="app-dev">
                            <span className="pill" style={{ ...pillStyle(categoryColor(e.app.category)), padding: "1px 7px", fontSize: 10.5 }}>
                              {e.app.category}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="num num-strong">{formatCompact(e.downloadsEstimate)}</td>
                  <td className="num num-strong">{formatMoney(e.revenueEstimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}

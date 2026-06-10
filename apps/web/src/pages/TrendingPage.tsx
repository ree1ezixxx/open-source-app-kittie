import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Store, AppSearchParams, AppListItem } from "@kittie/types";
import { AppIcon } from "../components/AppIcon";
import { PageShell } from "../components/PageShell";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { useApps } from "../hooks/useApps";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact, formatMoney } from "../lib/format";
import { IconTrending, IconChart } from "../icons";
import type { Theme } from "../lib/theme";

type ChartType = "free" | "paid" | "grossing";

const CATEGORIES = [
  "All categories", "Business", "Education", "Entertainment", "Finance", "Food & Drink",
  "Games", "Graphics & Design", "Health & Fitness", "Lifestyle", "Music", "News",
  "Photo & Video", "Productivity", "Shopping", "Social Networking", "Sports", "Travel",
  "Utilities", "Weather",
];

function paramsFor(chart: ChartType, store: Store, category: string): AppSearchParams {
  const base: AppSearchParams = {
    source: store,
    sortOrder: "desc",
    categories: category === "All categories" ? undefined : category,
  };
  if (chart === "free") return { ...base, priceType: "free", sortBy: "downloads" };
  if (chart === "paid") return { ...base, priceType: "paid", sortBy: "revenue" };
  return { ...base, priceType: "all", sortBy: "revenue" };
}

export function TrendingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const nav = useNavigate();
  const [chart, setChart] = useState<ChartType>("free");
  const [store, setStore] = useState<Store>("apple");
  const [category, setCategory] = useState("All categories");
  const { apps, loading } = useApps(paramsFor(chart, store, category));

  // 24h movement: where each app ranked within this same set one snapshot ago,
  // using estimates recomputed from prior-snapshot signals.
  const prevRank = useMemo(() => {
    const priorMetric = (a: AppListItem) =>
      chart === "free" ? a.downloadsEstimatePrior : a.revenueEstimatePrior;
    const ranked = new Map<string, number>();
    apps
      .filter((a) => priorMetric(a) != null)
      .sort((x, y) => (priorMetric(y) ?? 0) - (priorMetric(x) ?? 0))
      .forEach((a, idx) => ranked.set(a.id, idx + 1));
    return ranked;
  }, [apps, chart]);

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
          { id: "apple", label: "App Store" },
          { id: "google", label: "Google Play" },
        ]}
      />
      <div className="select">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <span className="pill" style={pillStyle("#9a9aa3")}>🇺🇸 United States</span>
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
      <div className="table-scroll">
        {loading ? (
          <EmptyState icon={<IconChart />} title="Loading rankings…" />
        ) : !apps.length ? (
          <EmptyState icon={<IconChart />} title="No apps in this chart" sub="Try another category or store." />
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
              {apps.map((a, i) => {
                const prev = prevRank.get(a.id);
                const move = prev != null ? prev - (i + 1) : null;
                return (
                <tr key={a.id} onClick={() => nav(`/apps/${a.id}`)}>
                  <td className="num num-strong">{i + 1}</td>
                  <td className="num">
                    {move == null ? (
                      <span className="num-muted">—</span>
                    ) : move === 0 ? (
                      <span className="num-muted">0</span>
                    ) : (
                      <span className={`delta ${move > 0 ? "up" : "down"}`}>
                        {move > 0 ? "▲" : "▼"}{Math.abs(move)}
                      </span>
                    )}
                  </td>
                  <td className="col-app">
                    <div className="app-cell">
                      <AppIcon url={a.iconUrl} title={a.title} />
                      <div className="app-meta">
                        <div className="app-title" title={a.title}>{a.title}</div>
                        {a.category && (
                          <div className="app-dev">
                            <span className="pill" style={{ ...pillStyle(categoryColor(a.category)), padding: "1px 7px", fontSize: 10.5 }}>
                              {a.category}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="num num-strong">{formatCompact(a.downloadsEstimate30d)}</td>
                  <td className="num num-strong">{formatMoney(a.revenueEstimate30d)}</td>
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

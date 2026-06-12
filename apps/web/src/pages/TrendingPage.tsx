import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChartType, Store, TopChartsResult } from "@kittie/types";
import { AppIcon } from "../components/AppIcon";
import { PageShell } from "../components/PageShell";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { listCharts } from "../lib/api";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact } from "../lib/format";
import { IconTrending, IconChart } from "../icons";
import type { Theme } from "../lib/theme";

const CATEGORIES = [
  "All categories", "Business", "Education", "Entertainment", "Finance", "Food & Drink",
  "Games", "Graphics & Design", "Health & Fitness", "Lifestyle", "Music", "News",
  "Photo & Video", "Productivity", "Shopping", "Social Networking", "Sports", "Travel",
  "Utilities", "Weather",
];

export function TrendingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const nav = useNavigate();
  const [chart, setChart] = useState<ChartType>("free");
  const [store, setStore] = useState<Store>("apple");
  const [category, setCategory] = useState("All categories");
  const [result, setResult] = useState<TopChartsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    listCharts(
      {
        store,
        type: chart,
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
  }, [chart, store, category]);

  const entries = result?.entries ?? [];
  const updated = result?.date
    ? new Date(result.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

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
      {updated && <span className="pill" style={pillStyle("#9a9aa3")}>Updated {updated}</span>}
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
        ) : !entries.length ? (
          <EmptyState
            icon={<IconChart />}
            title="No ranking data"
            sub={
              store === "google"
                ? "Google Play chart data isn't ingested yet."
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
                <th className="num">Rating</th>
                <th className="num">Reviews</th>
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
                        {e.rankDelta > 0 ? "▲" : "▼"}{Math.abs(e.rankDelta)}
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
                  <td className="num num-strong">{e.rating != null ? e.rating.toFixed(2) : "—"}</td>
                  <td className="num num-strong">{formatCompact(e.reviewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}

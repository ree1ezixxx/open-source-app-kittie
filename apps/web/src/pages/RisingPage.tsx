import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Store, GrowthPeriod } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { useApps } from "../hooks/useApps";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact, formatMoney } from "../lib/format";
import { IconRising, IconChart } from "../icons";
import type { Theme } from "../lib/theme";

type Launched = "3M" | "6M" | "1Y";
type Signal = "2W" | "1M" | "3M";

const LAUNCH_DAYS: Record<Launched, number> = { "3M": 90, "6M": 180, "1Y": 365 };
const SIGNAL_PERIOD: Record<Signal, GrowthPeriod> = { "2W": "14d", "1M": "30d", "3M": "90d" };
const CATEGORIES = [
  "All categories", "Business", "Education", "Entertainment", "Finance", "Food & Drink",
  "Games", "Health & Fitness", "Lifestyle", "Music", "Photo & Video", "Productivity",
  "Shopping", "Social Networking", "Travel", "Utilities",
];

export function RisingPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const nav = useNavigate();
  const [launched, setLaunched] = useState<Launched>("6M");
  const [signal, setSignal] = useState<Signal>("1M");
  const [store, setStore] = useState<Store>("apple");
  const [category, setCategory] = useState("All categories");

  const releasedAfter = useMemo(
    () => Math.floor((Date.now() - LAUNCH_DAYS[launched] * 86_400_000) / 1000),
    [launched],
  );

  const { apps, loading } = useApps({
    sortBy: "growth",
    growthType: "positive",
    sortOrder: "desc",
    growthPeriod: SIGNAL_PERIOD[signal],
    source: store,
    releasedAfter,
    categories: category === "All categories" ? undefined : category,
  });

  const toolbar = (
    <div className="toolbar">
      <span className="filter-label" style={{ alignSelf: "center" }}>Launched</span>
      <Segmented<Launched> value={launched} onChange={setLaunched} options={[{ id: "3M", label: "3M" }, { id: "6M", label: "6M" }, { id: "1Y", label: "1Y" }]} />
      <span className="filter-label" style={{ alignSelf: "center" }}>Signal</span>
      <Segmented<Signal> value={signal} onChange={setSignal} options={[{ id: "2W", label: "2W" }, { id: "1M", label: "1M" }, { id: "3M", label: "3M" }]} />
      <div className="toolbar-divider" />
      <Segmented<Store> value={store} onChange={setStore} options={[{ id: "apple", label: "App Store" }, { id: "google", label: "Google Play" }]} />
      <div className="select">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <Link className="btn" to="/dashboard/explore?sortBy=growth" style={{ marginLeft: "auto" }}>View in Explore</Link>
    </div>
  );

  return (
    <PageShell
      icon={<IconRising />}
      title="Rising Apps"
      sub="Apps with accelerating monthly recurring revenue"
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
              {apps.map((a, i) => (
                <tr key={a.id} onClick={() => nav(`/apps/${a.id}`)}>
                  <td className="num num-strong">{i + 1}</td>
                  <td className="col-app">
                    <div className="app-cell">
                      {a.iconUrl ? (
                        <img className="app-icon" src={a.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="app-icon placeholder">{a.title.charAt(0)}</div>
                      )}
                      <div className="app-meta">
                        <div className="app-title" title={a.title}>{a.title}</div>
                        <div className="app-dev">
                          {a.category && (
                            <span className="pill" style={{ ...pillStyle(categoryColor(a.category)), padding: "1px 7px", fontSize: 10.5 }}>{a.category}</span>
                          )}{" "}
                          {a.developer}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num num-strong">{formatMoney(a.revenueEstimate30d)}</td>
                  <td className="num">{a.growthScore != null ? <span className="delta up">{a.growthScore.toFixed(1)}</span> : <span className="num-muted">—</span>}</td>
                  <td className="num num-strong">{formatCompact(a.downloadsEstimate30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}

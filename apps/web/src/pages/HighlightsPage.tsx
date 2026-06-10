import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Store } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { Widget } from "../components/Widget";
import { RankList } from "../components/RankList";
import { Segmented } from "../components/Segmented";
import { useApps } from "../hooks/useApps";
import { EMPTY_FILTERS, writeFilters, type ExploreFilters } from "../lib/exploreFilters";
import { IconSpark } from "../icons";
import type { Theme } from "../lib/theme";

export function HighlightsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  // Live parity — store-only toggle (no "All stores" pill), Apple Store default.
  const [store, setStore] = useState<Store>("apple");
  const releasedAfter = useMemo(() => Math.floor((Date.now() - 90 * 86_400_000) / 1000), []);

  const bigHits = useApps({ sortBy: "downloads", sortOrder: "desc", source: store, releasedAfter });
  // 1D movement: growth is computed from daily snapshots; 7d is the tightest
  // window the API exposes, so it reflects the latest day-over-day deltas.
  const gainers = useApps({ sortBy: "growth", growthType: "positive", growthPeriod: "7d", sortOrder: "desc", source: store });
  const losers = useApps({ sortBy: "growth", growthType: "negative", growthPeriod: "7d", sortOrder: "asc", source: store });

  const storeToolbar = (
    <div className="toolbar">
      <Segmented<Store>
        value={store}
        onChange={setStore}
        options={[
          { id: "apple", label: "Apple Store" },
          { id: "google", label: "Google Play" },
        ]}
      />
      <span className="toolbar-meta">Filter all widgets by store source.</span>
    </div>
  );

  const viewAll = (f: Partial<ExploreFilters>) => (
    <Link
      className="btn"
      to={`/dashboard/explore?${writeFilters({ ...EMPTY_FILTERS, source: store, ...f }).toString()}`}
      style={{ height: 28, padding: "0 10px", fontSize: 12 }}
    >
      View all
    </Link>
  );

  return (
    <PageShell
      icon={<IconSpark />}
      title="Dashboard Highlights"
      sub="New big hits, top gainers & losers across the database"
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={storeToolbar}
    >
      <div className="widgets-grid">
        <Widget title="New Big Hits" action={viewAll({ sort: "downloads", rel: 90 })}>
          <RankList
            apps={bigHits.apps}
            loading={bigHits.loading}
            emptyTitle="No recent hits"
            emptySub="No high-traction apps released in the last 90 days for this store."
          />
        </Widget>

        <Widget title="Top Gainers" action={viewAll({ sort: "growth", gtype: "positive" })}>
          <RankList
            apps={gainers.apps}
            loading={gainers.loading}
            delta
            emptyTitle="Building baseline"
            emptySub="Daily rank movement needs 2+ days of snapshots — gainers appear once the baseline lands."
          />
        </Widget>

        <Widget title="Top Losers" action={viewAll({ sort: "growth", gtype: "negative", order: "asc" })}>
          <RankList
            apps={losers.apps}
            loading={losers.loading}
            delta
            emptyTitle="Building baseline"
            emptySub="Daily rank movement needs 2+ days of snapshots — losers appear once the baseline lands."
          />
        </Widget>
      </div>
    </PageShell>
  );
}

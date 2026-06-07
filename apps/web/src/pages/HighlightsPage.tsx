import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Store } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { Widget } from "../components/Widget";
import { RankList } from "../components/RankList";
import { Segmented } from "../components/Segmented";
import { useApps } from "../hooks/useApps";
import { IconSpark } from "../icons";
import type { Theme } from "../lib/theme";

type StoreFilter = "all" | Store;

export function HighlightsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [store, setStore] = useState<StoreFilter>("all");
  const source = store === "all" ? undefined : store;
  const releasedAfter = useMemo(() => Math.floor((Date.now() - 90 * 86_400_000) / 1000), []);

  const bigHits = useApps({ sortBy: "downloads", sortOrder: "desc", source, releasedAfter });
  const gainers = useApps({ sortBy: "growth", growthType: "positive", sortOrder: "desc", source });
  const losers = useApps({ sortBy: "growth", growthType: "negative", sortOrder: "asc", source });

  const storeToolbar = (
    <div className="toolbar">
      <Segmented<StoreFilter>
        value={store}
        onChange={setStore}
        options={[
          { id: "all", label: "All stores" },
          { id: "apple", label: "App Store" },
          { id: "google", label: "Google Play" },
        ]}
      />
      <span className="toolbar-meta">Filter all widgets by store source</span>
    </div>
  );

  const viewAll = (sort: string) => (
    <Link className="btn" to={`/dashboard/explore?sortBy=${sort}`} style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
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
        <Widget title="New Big Hits" action={viewAll("downloads")}>
          <RankList
            apps={bigHits.apps}
            loading={bigHits.loading}
            value="downloads"
            emptyTitle="No recent hits"
            emptySub="No high-traction apps released in the last 90 days for this store."
          />
        </Widget>

        <Widget title="Top Gainers" action={viewAll("growth")}>
          <RankList
            apps={gainers.apps}
            loading={gainers.loading}
            value="revenue"
            emptyTitle="Building baseline"
            emptySub="Daily rank movement needs 2+ days of snapshots — gainers appear once the baseline lands."
          />
        </Widget>

        <Widget title="Top Losers" action={viewAll("growth")}>
          <RankList
            apps={losers.apps}
            loading={losers.loading}
            value="revenue"
            emptyTitle="Building baseline"
            emptySub="Daily rank movement needs 2+ days of snapshots — losers appear once the baseline lands."
          />
        </Widget>
      </div>
    </PageShell>
  );
}

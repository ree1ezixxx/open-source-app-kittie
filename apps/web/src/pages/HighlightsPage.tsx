import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Store } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { Widget } from "../components/Widget";
import { RankList } from "../components/RankList";
import { useApps } from "../hooks/useApps";
import { IconSpark } from "../icons";
import type { Theme } from "../lib/theme";

/** A single independent store-source toggle (truth: "Select …" / "Included …"). */
function StoreToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn"
      aria-pressed={on}
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 12px",
        fontSize: 12,
        background: on ? "var(--accent)" : undefined,
        color: on ? "#0a0a0a" : undefined,
        borderColor: on ? "var(--accent)" : undefined,
      }}
    >
      {on ? `Included ${label}` : `Select ${label}`}
    </button>
  );
}

export function HighlightsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  // Two independent store toggles. Default = neither pressed = ALL stores. Both
  // pressed is also "all" (the universe is just apple + google).
  const [appleOn, setAppleOn] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const source: Store | undefined =
    appleOn && !googleOn ? "apple" : googleOn && !appleOn ? "google" : undefined;

  // New Big Hits — newly released apps by review volume (truth: reviews/desc/7d).
  const releasedAfter = useMemo(() => Math.floor((Date.now() - 7 * 86_400_000) / 1000), []);
  const bigHits = useApps({ sortBy: "reviews", sortOrder: "desc", source, releasedAfter });
  // Top Gainers / Losers — ranked by real chart-rank movement between the two
  // latest snapshot days (the "1D" delta). Nulls sink server-side, so desc
  // surfaces the biggest climbers and asc the biggest fallers.
  const gainers = useApps({ sortBy: "rankDelta", sortOrder: "desc", source });
  const losers = useApps({ sortBy: "rankDelta", sortOrder: "asc", source });

  const storeToolbar = (
    <div className="toolbar">
      <StoreToggle label="Apple Store" on={appleOn} onClick={() => setAppleOn((v) => !v)} />
      <StoreToggle label="Google Play" on={googleOn} onClick={() => setGoogleOn((v) => !v)} />
    </div>
  );

  const viewAll = (to: string) => (
    <Link className="btn" to={to} style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
      View all
    </Link>
  );

  // "View all" → Explore with the params our Explore page actually reads
  // (sort/order/rel/source — see exploreFilters), reproducing each widget's
  // query so the expanded list matches the card. Truth routes these to
  // /rising and /movers, but those don't exist (or sort differently) on the
  // clone, so we land on Explore with the equivalent sort instead.
  const srcSuffix = source ? `&source=${source}` : "";
  const bigHitsViewAll = `/dashboard/explore?sort=reviews&order=desc&rel=7${srcSuffix}`;
  const gainersViewAll = `/dashboard/explore?sort=rankDelta&order=desc${srcSuffix}`;
  const losersViewAll = `/dashboard/explore?sort=rankDelta&order=asc${srcSuffix}`;

  return (
    <PageShell
      icon={<IconSpark />}
      title="Dashboard Highlights"
      sub="Filter all widgets by store source."
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={storeToolbar}
    >
      <div className="widgets-grid">
        <Widget
          title="New Big Hits"
          count={bigHits.loading ? null : bigHits.total}
          action={viewAll(bigHitsViewAll)}
        >
          <RankList
            apps={bigHits.apps}
            loading={bigHits.loading}
            emptyTitle="No recent hits"
            emptySub="No high-traction apps released in the last 7 days for this store."
          />
        </Widget>

        <Widget title="Top Gainers" action={viewAll(gainersViewAll)}>
          <RankList
            apps={gainers.apps}
            loading={gainers.loading}
            delta
            emptyTitle="Building baseline"
            emptySub="Daily rank movement needs 2+ days of snapshots — gainers appear once the baseline lands."
          />
        </Widget>

        <Widget title="Top Losers" action={viewAll(losersViewAll)}>
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

import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { Widget } from "../components/Widget";
import { RankList } from "../components/RankList";
import { usePulseBriefing } from "../hooks/usePulseBriefing";
import { IconTrending } from "../icons";
import { formatCompact } from "../lib/format";
import type { Theme } from "../lib/theme";

/** Proactive briefing — surfaces “what moved” from existing snapshot data. */
export function PulsePage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { bigHits, gainers, losers } = usePulseBriefing();

  const topDelta = gainers.apps[0]?.rankDelta;
  const sub =
    bigHits.loading
      ? "Loading recent signals…"
      : bigHits.total > 0
        ? `${formatCompact(bigHits.total)} new releases this week${
            topDelta != null ? ` · top chart climb +${topDelta}` : ""
          }`
        : "No high-traction releases in the last 7 days yet.";

  const viewAll = (to: string) => (
    <Link className="btn" to={to} style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
      View all
    </Link>
  );

  return (
    <PageShell
      icon={<IconTrending />}
      title="Pulse"
      sub={sub}
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={
        <Link className="btn" to="/intelligence" style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
          App Intelligence
        </Link>
      }
    >
      <div className="widgets-grid">
        <Widget
          title="New Big Hits"
          count={bigHits.loading ? null : bigHits.total}
          action={viewAll("/intelligence")}
        >
          <RankList
            apps={bigHits.apps}
            loading={bigHits.loading}
            limit={5}
            emptyTitle="No recent hits"
            emptySub="No high-traction apps released in the last 7 days."
          />
        </Widget>

        <Widget title="Top Gainers">
          <RankList
            apps={gainers.apps}
            loading={gainers.loading}
            delta
            limit={5}
            emptyTitle="Building baseline"
            emptySub="Rank movers appear after 2+ snapshot days."
          />
        </Widget>

        <Widget title="Top Losers" action={viewAll("/intelligence")}>
          <RankList
            apps={losers.apps}
            loading={losers.loading}
            delta
            limit={5}
            emptyTitle="Building baseline"
            emptySub="Rank movers appear after 2+ snapshot days."
          />
        </Widget>
      </div>
    </PageShell>
  );
}

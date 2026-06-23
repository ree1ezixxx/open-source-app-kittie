import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AppListItem } from "@kittie/types";
import { PageShell } from "../components/PageShell";
import { StatChip } from "../components/ui/StatChip";
import { IconGrid } from "../icons";
import { getApp } from "../lib/api";
import { CANVAS_PROTOTYPE_APP_IDS } from "../lib/canvasPrototypeApps";
import { formatCompact, formatMoney } from "../lib/format";
import type { Theme } from "../lib/theme";

type Card = AppListItem & { loading?: false };

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mini-sparkline" aria-hidden>
      {values.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function CanvasGridPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [cards, setCards] = useState<(Card | { id: string; loading: true })[]>(
    CANVAS_PROTOTYPE_APP_IDS.map((id) => ({ id, loading: true as const })),
  );

  useEffect(() => {
    const ac = new AbortController();
    Promise.all(CANVAS_PROTOTYPE_APP_IDS.map((id) => getApp(id, ac.signal)))
      .then((apps) => {
        if (ac.signal.aborted) return;
        setCards(apps);
      })
      .catch(() => {
        if (!ac.signal.aborted) setCards([]);
      });
    return () => ac.abort();
  }, []);

  return (
    <PageShell
      icon={<IconGrid />}
      title="App Canvas"
      sub="Visual breakdown of what drives each app — pick one to open the interactive tree."
      theme={theme}
      onToggleTheme={onToggleTheme}
      bodyClass="canvas-grid-page"
    >
      <div className="canvas-prototype-grid">
        {cards.map((c) =>
          "loading" in c && c.loading ? (
            <div key={c.id} className="surface-card surface-card--loading skel" />
          ) : (
            <Link
              key={c.id}
              to={`/dashboard/canvas/${encodeURIComponent(c.id)}`}
              className="surface-card surface-card--interactive"
            >
              <div className="surface-card-shine" aria-hidden />
              <header className="surface-card-head">
                <div className="surface-card-icon-wrap">
                  {c.iconUrl ? <img src={c.iconUrl} alt="" width={52} height={52} /> : null}
                </div>
                <div className="surface-card-meta">
                  <h3 className="surface-card-title">{c.title}</h3>
                  <p className="surface-card-sub">{c.category ?? "Uncategorized"}</p>
                </div>
              </header>
              {c.sparkline && c.sparkline.length > 1 && <MiniSparkline values={c.sparkline} />}
              <div className="surface-card-stats">
                <StatChip label="Reviews" value={formatCompact(c.reviewCount)} />
                <StatChip label="MRR est." value={formatMoney(c.revenueEstimate30d)} tone="accent" />
                {c.rankDelta != null && (
                  <StatChip
                    label="Rank Δ"
                    value={c.rankDelta > 0 ? `+${c.rankDelta}` : String(c.rankDelta)}
                    tone={c.rankDelta > 0 ? "positive" : c.rankDelta < 0 ? "negative" : "neutral"}
                  />
                )}
              </div>
              <footer className="surface-card-foot">
                <span>Open intelligence canvas</span>
                <span className="surface-card-arrow">→</span>
              </footer>
            </Link>
          ),
        )}
      </div>
    </PageShell>
  );
}

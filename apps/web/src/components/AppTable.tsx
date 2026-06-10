import type { AppListItem, AppSortField, SortOrder } from "@kittie/types";
import {
  IconStar,
  IconApple,
  IconGooglePlay,
  IconSpark,
  IconArrowUp,
  IconArrowDown,
} from "../icons";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact, formatDate, formatMoney, formatRating, relativeTime } from "../lib/format";
import type { AppListItemEx } from "../lib/api";
import { FavoriteToggle } from "./FavoriteToggle";

type Col = {
  key: string;
  label: string;
  num?: boolean;
  sort?: AppSortField;
};

// Live column order: # · APP · CATEGORY · GROWTH 7D · RATING · REVIEWS ·
// DOWNLOADS · MRR · RELEASED · LAST UPDATE · ACTION. Store is a glyph on APP.
const COLS: Col[] = [
  { key: "app", label: "App" },
  { key: "category", label: "Category" },
  { key: "growth", label: "Growth 7d", sort: "growth" },
  { key: "rating", label: "Rating", num: true, sort: "rating" },
  { key: "reviews", label: "Reviews", num: true, sort: "reviews" },
  { key: "downloads", label: "Downloads", num: true, sort: "downloads" },
  { key: "mrr", label: "MRR", num: true, sort: "revenue" },
  { key: "released", label: "Released", num: true, sort: "released" },
  { key: "updated", label: "Last update", num: true, sort: "updated" },
  { key: "action", label: "Action", num: true },
];

/** Reviews growth over the window as a % of the prior count (live shows "+0.3%"). */
function growthPct(a: AppListItem): number | null {
  if (a.reviewGrowth7d == null) return null;
  const prior = a.reviewCount - a.reviewGrowth7d;
  if (prior <= 0) return null;
  return (a.reviewGrowth7d / prior) * 100;
}

/** Inline mini sparkline — renders whatever points exist; 1 point = flat line. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 56;
  const h = 18;
  const pad = 2;
  if (points.length === 0) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords: [number, number][] =
    points.length === 1
      ? [
          [pad, h / 2],
          [w - pad, h / 2],
        ]
      : points.map((v, i) => [
          pad + (i * (w - 2 * pad)) / (points.length - 1),
          h - pad - ((v - min) / span) * (h - 2 * pad),
        ]);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ flex: "none", display: "block" }}>
      <polyline
        points={coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={up ? "var(--positive)" : "var(--negative)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GrowthCell({ a }: { a: AppListItemEx }) {
  const pct = growthPct(a);
  const spark = a.sparkline ?? [];
  if (pct == null && spark.length === 0) return <span className="num-muted">—</span>;
  const up = (pct ?? 0) >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <Sparkline points={spark} up={up} />
      {pct != null ? (
        <span className={`delta ${up ? "up" : "down"}`}>
          {up ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      ) : (
        <span className="delta flat">0%</span>
      )}
    </span>
  );
}

/** "Sep 2008" — month + year, for the Released second line. */
function monthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function TwoLineDate({ iso, absolute }: { iso: string | null; absolute: string }) {
  if (!iso) return <span className="num-muted">—</span>;
  return (
    <>
      <div className="num-strong">{relativeTime(iso)}</div>
      <div className="cell-sub">{absolute}</div>
    </>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td className="num"><div className="skel" style={{ height: 11, width: 16, marginLeft: "auto" }} /></td>
      <td className="col-app">
        <div className="app-cell">
          <div className="skel skel-circ" style={{ width: 34, height: 34 }} />
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ width: "55%", height: 11, marginBottom: 6 }} />
            <div className="skel" style={{ width: "35%", height: 9 }} />
          </div>
        </div>
      </td>
      {COLS.slice(1).map((c) => (
        <td key={c.key} className={c.num ? "num" : ""}>
          <div
            className="skel"
            style={{ height: 11, width: c.num ? 48 : 80, marginLeft: c.num ? "auto" : 0 }}
          />
        </td>
      ))}
    </tr>
  );
}

export function AppTable({
  apps,
  loading,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
  startRank = 0,
}: {
  apps: AppListItem[];
  loading: boolean;
  sortBy: AppSortField;
  sortOrder: SortOrder;
  onSort: (f: AppSortField) => void;
  onSelect: (id: string) => void;
  startRank?: number;
}) {
  return (
    <table className="apps">
      <thead>
        <tr>
          <th className="num rank-th">#</th>
          {COLS.map((c) => (
            <th
              key={c.key}
              className={`${c.num ? "num" : ""} ${c.sort ? "sortable" : ""} ${c.key === "app" ? "col-app" : ""}`}
              onClick={c.sort ? () => onSort(c.sort!) : undefined}
            >
              <span className="th-inner">
                {c.label}
                {c.sort && sortBy === c.sort && (
                  <span className="sort-caret">
                    {sortOrder === "desc" ? <IconArrowDown style={{ width: 12, height: 12 }} /> : <IconArrowUp style={{ width: 12, height: 12 }} />}
                  </span>
                )}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
          : apps.map((a, i) => {
              const cColor = categoryColor(a.category);
              const StoreGlyph = a.store === "apple" ? IconApple : IconGooglePlay;
              return (
                <tr key={a.id} onClick={() => onSelect(a.id)}>
                  <td className="num rank-cell">{startRank + i + 1}</td>
                  <td className="col-app">
                    <div className="app-cell">
                      {a.iconUrl ? (
                        <img className="app-icon" src={a.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="app-icon placeholder">{a.title.charAt(0)}</div>
                      )}
                      <div className="app-meta">
                        <div className="app-title" title={a.title}>
                          {a.title}
                          {a.isFirstMover && (
                            <span className="fm-badge" style={{ marginLeft: 8 }}>
                              <IconSpark /> First mover
                            </span>
                          )}
                        </div>
                        <div className="app-dev" title={a.developer}>
                          <StoreGlyph
                            aria-label={a.store === "apple" ? "App Store" : "Google Play"}
                            style={{ width: 11, height: 11, verticalAlign: -1.5, marginRight: 4, opacity: 0.7 }}
                          />
                          {a.developer}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {a.category ? (
                      <span className="pill" style={pillStyle(cColor)}>
                        <span className="dot" /> {a.category}
                      </span>
                    ) : (
                      <span className="num-muted">—</span>
                    )}
                  </td>
                  <td>
                    <GrowthCell a={a as AppListItemEx} />
                  </td>
                  <td className="num">
                    {a.rating != null ? (
                      <span className="rating">
                        <IconStar /> <span className="num-strong">{formatRating(a.rating)}</span>
                      </span>
                    ) : (
                      <span className="num-muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    <div className="num-strong">{formatCompact(a.reviewCount)} reviews</div>
                    <div className="cell-sub">{a.reviewCount.toLocaleString()}</div>
                  </td>
                  <td className="num">
                    {a.downloadsEstimate30d != null ? (
                      <span className="num-strong">{formatCompact(a.downloadsEstimate30d)}</span>
                    ) : (
                      <span className="num-muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    <span className="num-strong">{formatMoney(a.revenueEstimate30d)}</span>
                  </td>
                  <td className="num">
                    <TwoLineDate iso={a.releasedAt} absolute={monthYear(a.releasedAt)} />
                  </td>
                  <td className="num">
                    <TwoLineDate iso={a.updatedAt} absolute={formatDate(a.updatedAt)} />
                  </td>
                  <td className="num">
                    <span
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="link-btn"
                        style={{ color: "var(--accent)" }}
                        onClick={() => onSelect(a.id)}
                      >
                        View
                      </button>
                      <FavoriteToggle
                        type="app"
                        id={a.id}
                        snapshot={{
                          title: a.title,
                          subtitle: a.developer,
                          icon: a.iconUrl ?? undefined,
                          href: `/apps/${a.id}`,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );
}

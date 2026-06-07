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
import { formatCompact, formatMoney, formatRating, relativeTime } from "../lib/format";

type Col = {
  key: string;
  label: string;
  num?: boolean;
  sort?: AppSortField;
};

const COLS: Col[] = [
  { key: "app", label: "App" },
  { key: "store", label: "Store" },
  { key: "category", label: "Category" },
  { key: "rating", label: "Rating", num: true, sort: "rating" },
  { key: "reviews", label: "Reviews", num: true, sort: "reviews" },
  { key: "downloads", label: "Downloads 30d", num: true, sort: "downloads" },
  { key: "revenue", label: "Revenue 30d", num: true, sort: "revenue" },
  { key: "growth", label: "Growth", num: true, sort: "growth" },
  { key: "released", label: "Released", num: true, sort: "released" },
  { key: "updated", label: "Updated", num: true, sort: "updated" },
];

function StorePill({ store }: { store: AppListItem["store"] }) {
  const apple = store === "apple";
  const color = apple ? "#c8c8d0" : "#34d399";
  return (
    <span className="pill pill-store" style={pillStyle(color)}>
      {apple ? <IconApple /> : <IconGooglePlay />}
      {apple ? "App Store" : "Google Play"}
    </span>
  );
}

function ReviewDelta({ d }: { d: number | null }) {
  if (d == null || d === 0) return null;
  const up = d > 0;
  return (
    <span className={`delta ${up ? "up" : "down"}`} style={{ marginLeft: 6 }}>
      {up ? "+" : ""}
      {formatCompact(Math.abs(d))}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
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
}: {
  apps: AppListItem[];
  loading: boolean;
  sortBy: AppSortField;
  sortOrder: SortOrder;
  onSort: (f: AppSortField) => void;
  onSelect: (id: string) => void;
}) {
  const maxRev = Math.max(1, ...apps.map((a) => a.revenueEstimate30d ?? 0));

  return (
    <table className="apps">
      <thead>
        <tr>
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
          : apps.map((a) => {
              const cColor = categoryColor(a.category);
              const revPct = ((a.revenueEstimate30d ?? 0) / maxRev) * 100;
              return (
                <tr key={a.id} onClick={() => onSelect(a.id)}>
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
                        <div className="app-dev" title={a.developer}>{a.developer}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StorePill store={a.store} />
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
                    <span className="num-strong">{formatCompact(a.reviewCount)}</span>
                    <ReviewDelta d={a.reviewGrowth7d} />
                  </td>
                  <td className="num">
                    {a.downloadsEstimate30d != null ? (
                      <span className="num-strong">{formatCompact(a.downloadsEstimate30d)}</span>
                    ) : (
                      <span className="num-muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    <span className="bar-cell">
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${revPct}%` }} />
                      </span>
                      <span className="bar-val">{formatMoney(a.revenueEstimate30d)}</span>
                    </span>
                  </td>
                  <td className="num">
                    {a.growthScore != null ? (
                      <span className="num-muted">{a.growthScore.toFixed(1)}</span>
                    ) : (
                      <span className="num-muted">—</span>
                    )}
                  </td>
                  <td className="num cell-sub">{relativeTime(a.releasedAt)}</td>
                  <td className="num cell-sub">{relativeTime(a.updatedAt)}</td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );
}

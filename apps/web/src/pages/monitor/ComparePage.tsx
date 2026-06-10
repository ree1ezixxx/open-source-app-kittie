/* ============================================================
   Additive lane — Compare. /monitor/compare
   Side-by-side comparison of 2–5 apps: listing facts, latest
   tracked metrics (best value highlighted per row), and overlaid
   snapshot-history charts. Selection lives in ?ids= so the view
   is shareable. All data is REAL (GET /intel/compare); modelled
   estimates are labelled "est." — nothing is dressed up.

   Chart note: components/Chart.tsx (HistoryChart) is single-series
   (one accent line + gradient), so the overlays here are inline
   SVG polylines — no new chart library.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageShell } from "../../components/PageShell";
import { IconClose, IconGrid, IconInfo, IconSearch } from "../../icons";
import {
  COMPARE_MAX,
  COMPARE_MIN,
  fetchCompare,
  searchPickerApps,
  type CompareApp,
  type CompareHistoryPoint,
  type PickerApp,
} from "../../lib/api/compare";
import { formatCompact, formatDate, formatMoney, formatRating } from "../../lib/format";
import type { Theme } from "../../lib/theme";
import "../../styles/compare.css";

/* One stable color per column position (max 5 apps). Accent-first so the
   first series matches the rest of the dashboard's chart language. */
const SERIES_COLORS = ["#c6f24d", "#6aa3ff", "#ff85c0", "#f5b545", "#4fd0d8"];

function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length] ?? "#8a8a92";
}

/* ----------------------------------------------------------------
   Metric table definition. `num` makes a row comparable; `best`
   says which direction wins. Rows without `num` are descriptive —
   no winner is highlighted (e.g. price: cheaper isn't "better").
   ---------------------------------------------------------------- */
interface MetricRow {
  label: string;
  est?: boolean; // modelled estimate — label it honestly
  best?: "max" | "min";
  num?: (a: CompareApp) => number | null;
  text: (a: CompareApp) => string;
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  if (price === 0) return "Free";
  return `$${price.toFixed(2)}`;
}

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

const ROWS: MetricRow[] = [
  { label: "Developer", text: (a) => a.developer || "—" },
  { label: "Category", text: (a) => a.category ?? "—" },
  { label: "Price", text: (a) => formatPrice(a.price) },
  { label: "Content rating", text: (a) => a.contentRating ?? "—" },
  { label: "Released", text: (a) => formatDate(a.releasedAt) },
  {
    label: "Last updated",
    best: "max",
    num: (a) => parseTime(a.updatedAt),
    text: (a) => formatDate(a.updatedAt),
  },
  {
    label: "Screenshots",
    best: "max",
    num: (a) => a.screenshotCount,
    text: (a) => String(a.screenshotCount),
  },
  {
    label: "Review count",
    best: "max",
    num: (a) => a.latest?.reviewCount ?? null,
    text: (a) => formatCompact(a.latest?.reviewCount ?? null),
  },
  {
    label: "Rating",
    best: "max",
    num: (a) => a.latest?.rating ?? null,
    text: (a) => formatRating(a.latest?.rating ?? null),
  },
  {
    label: "Chart rank",
    best: "min", // lower rank = better placement
    num: (a) => a.latest?.chartRank ?? null,
    text: (a) => (a.latest?.chartRank != null ? `#${a.latest.chartRank}` : "—"),
  },
  {
    label: "Downloads / mo",
    est: true,
    best: "max",
    num: (a) => a.latest?.downloadsEstimate ?? null,
    text: (a) => formatCompact(a.latest?.downloadsEstimate ?? null),
  },
  {
    label: "Revenue / mo",
    est: true,
    best: "max",
    num: (a) => a.latest?.revenueEstimate ?? null,
    text: (a) => formatMoney(a.latest?.revenueEstimate ?? null),
  },
  {
    label: "Growth score",
    best: "max",
    num: (a) => a.latest?.growthScore ?? null,
    text: (a) => (a.latest?.growthScore != null ? a.latest.growthScore.toFixed(1) : "—"),
  },
];

/** Ids that win a row. Empty when <2 comparable values or all tie —
    highlighting everything is the same as highlighting nothing. */
function bestIds(row: MetricRow, apps: CompareApp[]): Set<string> {
  const out = new Set<string>();
  if (!row.num || !row.best) return out;
  const vals = apps
    .map((a) => ({ id: a.id, v: row.num!(a) }))
    .filter((x): x is { id: string; v: number } => x.v != null);
  if (vals.length < 2) return out;
  const winner =
    row.best === "max" ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
  const losersExist = vals.some((x) => x.v !== winner);
  if (!losersExist) return out;
  for (const x of vals) if (x.v === winner) out.add(x.id);
  return out;
}

/* ----------------------------------------------------------------
   Overlaid history chart — one panel per metric, one polyline per
   app. History is only days deep, so points are first-class: a
   1-point series renders as a dot, 2–3 points as dots + a line.
   ---------------------------------------------------------------- */
type HistoryMetric = Exclude<keyof CompareHistoryPoint, "date">;

interface ChartDef {
  key: HistoryMetric;
  label: string;
  est?: boolean;
  fmt: (n: number) => string;
}

const CHARTS: ChartDef[] = [
  { key: "reviewCount", label: "Reviews", fmt: (n) => formatCompact(n) },
  { key: "rating", label: "Rating", fmt: (n) => formatRating(n) },
  { key: "revenueEstimate", label: "Revenue", est: true, fmt: (n) => formatMoney(n) },
  { key: "downloadsEstimate", label: "Downloads", est: true, fmt: (n) => formatCompact(n) },
  { key: "growthScore", label: "Growth", fmt: (n) => n.toFixed(1) },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function CompareChart({ def, apps }: { def: ChartDef; apps: CompareApp[] }) {
  const dates = useMemo(
    () => Array.from(new Set(apps.flatMap((a) => a.history.map((h) => h.date)))).sort(),
    [apps],
  );
  const dateIdx = useMemo(() => new Map(dates.map((d, i) => [d, i])), [dates]);

  const series = apps.map((a, i) => ({
    app: a,
    color: seriesColor(i),
    pts: a.history
      .filter((h) => h[def.key] != null)
      .map((h) => ({ date: h.date, value: h[def.key] as number }))
      .sort((p, q) => (p.date < q.date ? -1 : 1)),
  }));

  const allVals = series.flatMap((s) => s.pts.map((p) => p.value));
  if (dates.length === 0 || allVals.length === 0) {
    return (
      <div className="cmp-panel">
        <PanelHead def={def} />
        <div className="cmp-plot cmp-plot--empty">No snapshot history for this metric yet.</div>
      </div>
    );
  }

  let lo = Math.min(...allVals);
  let hi = Math.max(...allVals);
  if (lo === hi) {
    // flat or single value — open the scale so the dot sits mid-panel
    const pad = Math.abs(lo) * 0.15 || 1;
    lo -= pad;
    hi += pad;
  } else {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  const span = hi - lo;

  const xAt = (date: string): number => {
    if (dates.length === 1) return 50;
    const i = dateIdx.get(date) ?? 0;
    return (i / (dates.length - 1)) * 100;
  };
  const yAt = (v: number): number => (1 - (v - lo) / span) * 100;

  // ≤4 evenly spaced date labels
  const xCount = Math.min(4, dates.length);
  const xLabels =
    xCount === 1
      ? [dates[0]!]
      : Array.from({ length: xCount }, (_, k) => dates[Math.round((k / (xCount - 1)) * (dates.length - 1))]!);

  return (
    <div className="cmp-panel">
      <PanelHead def={def} />
      <div className="cmp-plot">
        {[hi, (hi + lo) / 2, lo].map((t) => (
          <div key={t} className="cmp-grid" style={{ top: `${yAt(t)}%` }}>
            <span className="cmp-ylab">{def.fmt(t)}</span>
          </div>
        ))}
        <svg className="cmp-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {series.map(
            (s) =>
              s.pts.length >= 2 && (
                <path
                  key={s.app.id}
                  d={s.pts
                    .map((p, i) => `${i ? "L" : "M"}${xAt(p.date).toFixed(2)} ${yAt(p.value).toFixed(2)}`)
                    .join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ),
          )}
        </svg>
        {series.map((s) =>
          s.pts.map((p) => (
            <span
              key={`${s.app.id}-${p.date}`}
              className="cmp-pt"
              style={{ left: `${xAt(p.date)}%`, top: `${yAt(p.value)}%`, background: s.color }}
              title={`${s.app.title} — ${def.fmt(p.value)} (${shortDate(p.date)})`}
            />
          )),
        )}
      </div>
      <div className="cmp-xaxis">
        {Array.from(new Set(xLabels)).map((d) => (
          <span key={d} className="cmp-xlab" style={{ left: `${xAt(d)}%` }}>
            {shortDate(d)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PanelHead({ def }: { def: ChartDef }) {
  return (
    <div className="cmp-panel-head">
      <span className="cmp-panel-title">{def.label}</span>
      {def.est && <span className="cmp-est">est.</span>}
    </div>
  );
}

/* ----------------------------------------------------------------
   App icon with letter fallback (icons can be null in the DB).
   ---------------------------------------------------------------- */
function AppIcon({ url, title, className }: { url: string | null; title: string; className: string }) {
  if (url) return <img className={className} src={url} alt="" loading="lazy" />;
  return <span className={`${className} cmp-icon-fallback`}>{(title[0] ?? "?").toUpperCase()}</span>;
}

/* ----------------------------------------------------------------
   Page
   ---------------------------------------------------------------- */
interface ChipMeta {
  title: string;
  developer: string;
  iconUrl: string | null;
}

export function ComparePage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ids = useMemo(() => {
    const raw = searchParams.get("ids") ?? "";
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out.slice(0, COMPARE_MAX);
  }, [searchParams]);
  const idsKey = ids.join(",");

  const [apps, setApps] = useState<CompareApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chip labels for ids whose compare payload hasn't arrived (or never will,
  // e.g. an unknown id pasted into a shared URL). Populated from picker picks
  // and from every loaded payload.
  const [meta, setMeta] = useState<Record<string, ChipMeta>>({});

  // ---- picker search (debounced, aborted on supersede) ----
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerApp[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [popOpen, setPopOpen] = useState(false);

  function setIds(next: string[]) {
    const sp = new URLSearchParams(searchParams);
    if (next.length === 0) sp.delete("ids");
    else sp.set("ids", next.join(","));
    setSearchParams(sp, { replace: true });
  }

  function addApp(p: PickerApp) {
    if (ids.includes(p.id) || ids.length >= COMPARE_MAX) return;
    setMeta((m) => ({ ...m, [p.id]: { title: p.title, developer: p.developer, iconUrl: p.iconUrl } }));
    setIds([...ids, p.id]);
    setQuery("");
    setResults([]);
    setPopOpen(false);
  }

  function removeApp(id: string) {
    setIds(ids.filter((x) => x !== id));
  }

  // compare fetch — only meaningful at 2+ ids (server 400s below that)
  useEffect(() => {
    if (ids.length < COMPARE_MIN) {
      setApps(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchCompare(ids, ac.signal)
      .then((data) => {
        setApps(data);
        setMeta((m) => {
          const next = { ...m };
          for (const a of data) next[a.id] = { title: a.title, developer: a.developer, iconUrl: a.iconUrl };
          return next;
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load comparison");
        setLoading(false);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const ac = new AbortController();
    setSearching(true);
    setSearchError(null);
    const t = window.setTimeout(() => {
      searchPickerApps(q, ac.signal)
        .then((r) => {
          setResults(r);
          setSearching(false);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          setSearchError(e instanceof Error ? e.message : "Search failed");
          setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  // close the dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setPopOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const loaded = ids.length >= COMPARE_MIN && apps != null;
  const foundIds = useMemo(() => new Set((apps ?? []).map((a) => a.id)), [apps]);
  const missingIds = loaded ? ids.filter((id) => !foundIds.has(id)) : [];
  const shown = loaded ? apps : null;
  const historyDays = useMemo(
    () =>
      shown ? new Set(shown.flatMap((a) => a.history.map((h) => h.date))).size : 0,
    [shown],
  );
  const full = ids.length >= COMPARE_MAX;

  return (
    <PageShell
      icon={<IconGrid style={{ width: 18, height: 18 }} />}
      title="Compare"
      sub="Side-by-side app intelligence"
      count={ids.length > 0 ? <span className="cmp-count">{ids.length}/{COMPARE_MAX}</span> : undefined}
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div className="cmp-wrap">
        {/* ---- picker ---- */}
        <section className="cmp-picker">
          <div className="cmp-chips">
            {ids.map((id, i) => {
              const m = meta[id];
              const missing = missingIds.includes(id);
              return (
                <span key={id} className={`cmp-chip ${missing ? "cmp-chip--missing" : ""}`}>
                  <span className="cmp-chip-dot" style={{ background: seriesColor(i) }} />
                  <AppIcon url={m?.iconUrl ?? null} title={m?.title ?? id} className="cmp-chip-icon" />
                  <span className="cmp-chip-title">{m?.title ?? id}</span>
                  {missing && <span className="cmp-chip-missing-tag">not found</span>}
                  <button className="cmp-chip-x" onClick={() => removeApp(id)} aria-label={`Remove ${m?.title ?? id}`}>
                    <IconClose style={{ width: 12, height: 12 }} />
                  </button>
                </span>
              );
            })}
            <div className="cmp-search" ref={searchRef}>
              <IconSearch className="cmp-search-icon" style={{ width: 14, height: 14 }} />
              <input
                className="cmp-search-input"
                value={query}
                disabled={full}
                placeholder={full ? `Max ${COMPARE_MAX} apps` : "Add an app…"}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPopOpen(true);
                }}
                onFocus={() => setPopOpen(true)}
              />
              {popOpen && query.trim().length >= 2 && (
                <div className="cmp-search-pop">
                  {searching && <div className="cmp-search-note">Searching…</div>}
                  {searchError && <div className="cmp-search-note">{searchError}</div>}
                  {!searching && !searchError && results.length === 0 && (
                    <div className="cmp-search-note">No apps match “{query.trim()}”.</div>
                  )}
                  {results.map((r) => {
                    const picked = ids.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        className="cmp-search-item"
                        disabled={picked}
                        onClick={() => addApp(r)}
                      >
                        <AppIcon url={r.iconUrl} title={r.title} className="cmp-search-item-icon" />
                        <span className="cmp-search-item-text">
                          <span className="cmp-search-item-title">{r.title}</span>
                          <span className="cmp-search-item-dev">{r.developer}</span>
                        </span>
                        <span className="cmp-search-item-add">{picked ? "Added" : "Add"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---- states ---- */}
        {error && (
          <div className="cmp-error">
            <IconInfo style={{ width: 14, height: 14 }} />
            <span>{error}</span>
            <button className="btn" onClick={() => setIds([...ids])}>
              Retry
            </button>
          </div>
        )}

        {ids.length < COMPARE_MIN && (
          <div className="cmp-empty">
            <IconGrid style={{ width: 22, height: 22 }} />
            <div className="cmp-empty-title">Pick {COMPARE_MIN}–{COMPARE_MAX} apps to compare</div>
            <p className="cmp-empty-sub">
              Search above to add apps. Listing facts, the latest tracked metrics and snapshot
              history render side by side — and the selection lives in the URL, so the view is
              shareable as-is.
              {ids.length === 1 && " One app selected — add at least one more."}
            </p>
          </div>
        )}

        {ids.length >= COMPARE_MIN && loading && !apps && <div className="cmp-loading">Loading comparison…</div>}

        {missingIds.length > 0 && (
          <div className="cmp-note">
            <IconInfo style={{ width: 13, height: 13 }} />
            {missingIds.length} selected id{missingIds.length === 1 ? " isn't" : "s aren't"} in the
            database — remove the greyed chip{missingIds.length === 1 ? "" : "s"} or re-add via search.
          </div>
        )}

        {shown && shown.length === 1 && (
          <div className="cmp-empty">
            <div className="cmp-empty-title">Only one of the selected apps exists</div>
            <p className="cmp-empty-sub">Comparison needs at least two known apps — add another above.</p>
          </div>
        )}

        {shown && shown.length >= COMPARE_MIN && (
          <>
            {/* ---- metric table ---- */}
            <section className="cmp-section">
              <div className="cmp-table-wrap">
                <table className="cmp-table">
                  <thead>
                    <tr>
                      <th className="cmp-th-metric">Metric</th>
                      {shown.map((a, i) => (
                        <th key={a.id} className="cmp-th-app">
                          <div className="cmp-app-head">
                            <AppIcon url={a.iconUrl} title={a.title} className="cmp-app-icon" />
                            <div className="cmp-app-name">
                              <span className="cmp-app-dot" style={{ background: seriesColor(i) }} />
                              <span className="cmp-app-title">{a.title}</span>
                            </div>
                            <span className="cmp-app-dev">{a.developer}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => {
                      const winners = bestIds(row, shown);
                      return (
                        <tr key={row.label}>
                          <td className="cmp-td-label">
                            {row.label}
                            {row.est && <span className="cmp-est">est.</span>}
                          </td>
                          {shown.map((a) => (
                            <td key={a.id} className={winners.has(a.id) ? "cmp-best" : undefined}>
                              {row.text(a)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {shown.some((a) => a.latest == null) && (
                <div className="cmp-note">
                  <IconInfo style={{ width: 13, height: 13 }} />
                  Some apps have no snapshot yet — their metric rows show “—” until the first daily
                  capture lands.
                </div>
              )}
            </section>

            {/* ---- overlaid history ---- */}
            <section className="cmp-section">
              <div className="cmp-section-head">
                <h2 className="cmp-h2">History</h2>
                <span className="cmp-section-sub">
                  {historyDays === 0
                    ? "No snapshots captured yet — history accrues daily."
                    : `${historyDays} snapshot day${historyDays === 1 ? "" : "s"} captured so far — history accrues daily.`}
                </span>
              </div>
              <div className="cmp-legend">
                {shown.map((a, i) => (
                  <span key={a.id} className="cmp-legend-item">
                    <span className="cmp-legend-dot" style={{ background: seriesColor(i) }} />
                    {a.title}
                  </span>
                ))}
              </div>
              <div className="cmp-chart-grid">
                {CHARTS.map((def) => (
                  <CompareChart key={def.key} def={def} apps={shown} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}

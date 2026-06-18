import type {
  ChartEntry,
  ChartType,
  Store,
  TopChartsResult,
} from "@kittie/types";

/**
 * Store-ranking charts (Trending / "Store Rankings"), computed on read.
 *
 * The chart *type* is stored in `app_snapshots.chart_category`, but that column
 * has drifted across ingest generations — older rows use the raw Apple feed
 * ids (`topfreeapplications`), newer rows use slugs (`top-free`). All reads go
 * through {@link normalizeChartType} so both collapse to one canonical
 * {@link ChartType}; the assembly is a pure function over already-fetched rows
 * so the date-resolution and 24h-delta logic is unit-testable without a DB.
 *
 * This module is deliberately DB-free (pure) — the database shell that loads
 * the rows lives in `charts-query.ts`.
 */

/** Collapse any historical `chart_category` encoding to a canonical chart type. */
export function normalizeChartType(raw: string | null): ChartType | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  // Order matters: "grossing" is the most specific; "free"/"paid" never co-occur.
  if (v.includes("grossing")) return "grossing";
  if (v.includes("paid")) return "paid";
  if (v.includes("free")) return "free";
  return null;
}

/**
 * Split a raw `chart_category` into its canonical type AND its genre. The modern
 * feed encodes both in one column: `top-free` is the OVERALL free chart, while
 * `top-free:Games` is the free *Games* chart. Genre is the part after the colon
 * (null for an overall chart); legacy ids like `topfreeapplications` carry no
 * genre. Returns null when the value isn't a chart at all.
 *
 * This is what makes the category selector real: the chart's own genre lives
 * here, NOT in `apps.category` (an app's listed category is a different axis —
 * a Game can chart on the overall list without being "the Games chart").
 */
export function parseChartCategory(
  raw: string | null,
): { type: ChartType; genre: string | null } | null {
  const type = normalizeChartType(raw);
  if (!type || !raw) return null;
  const idx = raw.indexOf(":");
  const genre = idx >= 0 ? raw.slice(idx + 1).trim() || null : null;
  return { type, genre };
}

/** A chart-bearing snapshot row joined to its app — the pure assembler's input. */
export interface ChartRow {
  appId: string;
  snapshotDate: string;
  chartRank: number;
  chartCategory: string | null;
  rating: number | null;
  reviewCount: number;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
  app: ChartEntry["app"];
}

export interface TopChartsParams {
  store: Store;
  type: ChartType;
  /** Storefront, defaults to "US". */
  country?: string;
  /** Genre filter on `apps.category`; null/undefined = overall chart. */
  category?: string | null;
  /** Pin to a specific chart date; defaults to the latest available. */
  date?: string;
  /** Max entries returned; defaults to 100. */
  limit?: number;
}

/**
 * Pure assembly: pick the target date, rank the apps on it, and attach each
 * app's movement against the most recent prior day that has chart data.
 */
export function assembleTopCharts(
  rows: ChartRow[],
  params: TopChartsParams,
): TopChartsResult {
  const country = params.country ?? "US";
  const limit = params.limit ?? 100;
  const base = {
    store: params.store,
    country,
    type: params.type,
    category: params.category ?? null,
  };

  // Keep only rows of the requested chart IDENTITY — both the canonical type AND
  // the requested genre. An overall request (category null) takes only the genre-
  // less encodings (`top-free`); a "Games" request takes only `top-free:Games`.
  // This is the core correctness fix: previously every genre's `top-free:<genre>`
  // shared one canonical type, so a 100-row genre chart out-sized the real 99-row
  // overall `top-free` and silently rendered a genre as "the free chart" (with
  // garbage deltas, since the prior day resolved to a *different* genre).
  const wantGenre = params.category ?? null;
  const typed = rows.filter((r) => {
    if (r.chartRank == null) return false;
    const pc = parseChartCategory(r.chartCategory);
    return pc?.type === params.type && (pc.genre ?? null) === wantGenre;
  });
  if (typed.length === 0) {
    return { ...base, date: null, entries: [] };
  }

  // The same canonical type can be backed by more than one raw encoding on a
  // day. Two shapes occur: a clean overall ranking (modern `top-grossing`,
  // ranks 1..N each once) and a legacy *per-genre union* (`topgrossingapplications`,
  // every genre's 1..N stacked, so ranks repeat ~once per genre). A chart is a
  // single source ranking, so on any date we pick the best raw encoding —
  // preferring a clean unique-rank ranking, then larger, then key for
  // determinism. When a `category` filter is applied upstream the legacy union
  // collapses to one genre and is itself clean.
  const isClean = (group: ChartRow[]): boolean =>
    new Set(group.map((r) => r.chartRank)).size === group.length;

  const bestGroupForDate = (date: string): { rows: ChartRow[]; clean: boolean } | null => {
    const byEncoding = new Map<string, ChartRow[]>();
    for (const r of typed) {
      if (r.snapshotDate !== date) continue;
      const key = r.chartCategory ?? "";
      const bucket = byEncoding.get(key);
      if (bucket) bucket.push(r);
      else byEncoding.set(key, [r]);
    }
    let best: { rows: ChartRow[]; clean: boolean; key: string } | null = null;
    for (const [key, rows] of byEncoding) {
      const clean = isClean(rows);
      const better =
        best === null ||
        (clean && !best.clean) ||
        (clean === best.clean && rows.length > best.rows.length) ||
        (clean === best.clean && rows.length === best.rows.length && key < best.key);
      if (better) best = { rows, clean, key };
    }
    return best ? { rows: best.rows, clean: best.clean } : null;
  };

  const datesDesc = [...new Set(typed.map((r) => r.snapshotDate))].sort((a, b) => (a < b ? 1 : -1));

  // Resolve the chart date. Auto mode requires a clean ranking — an overall
  // request with only per-genre legacy data (no clean source) honestly renders
  // empty rather than a misleading deduped blob.
  let targetDate: string | null = null;
  if (params.date !== undefined) {
    targetDate = params.date;
  } else {
    for (const d of datesDesc) {
      if (bestGroupForDate(d)?.clean) {
        targetDate = d;
        break;
      }
    }
  }
  if (targetDate === null) {
    return { ...base, date: null, entries: [] };
  }

  const target = bestGroupForDate(targetDate);
  if (!target || target.rows.length === 0) {
    return { ...base, date: targetDate, entries: [] };
  }

  // If a pinned date only has an unclean union, collapse to one app per rank
  // (highest review count) so the output never carries duplicate ranks.
  const sourceRows = target.clean ? target.rows : collapseToUniqueRanks(target.rows);

  // Movement against the nearest prior day that has a *clean* ranking, so we
  // compare like-with-like (never a clean overall chart against a legacy
  // per-genre union). Falls back to an unclean group's collapse only when the
  // target itself is pinned-unclean and no clean prior exists.
  const cleanPriorDate = datesDesc.find((d) => d < targetDate! && bestGroupForDate(d)?.clean);
  const priorDate = cleanPriorDate ?? datesDesc.find((d) => d < targetDate!) ?? null;
  const priorRank = new Map<string, number>();
  if (priorDate != null) {
    const priorGroup = bestGroupForDate(priorDate);
    const priorRows = priorGroup
      ? priorGroup.clean
        ? priorGroup.rows
        : collapseToUniqueRanks(priorGroup.rows)
      : [];
    for (const r of priorRows) priorRank.set(r.appId, r.chartRank);
  }

  const entries: ChartEntry[] = [...sourceRows]
    .sort((a, b) => a.chartRank - b.chartRank)
    .slice(0, limit)
    .map((r) => {
      const prior = priorRank.get(r.appId);
      return {
        rank: r.chartRank,
        rankDelta: prior != null ? prior - r.chartRank : null,
        app: r.app,
        rating: r.rating,
        reviewCount: r.reviewCount,
        downloadsEstimate: r.downloadsEstimate,
        revenueEstimate: r.revenueEstimate,
      };
    });

  return { ...base, date: targetDate, entries };
}

/** Keep one app per rank (the highest review count) so a union never emits duplicate ranks. */
function collapseToUniqueRanks(rows: ChartRow[]): ChartRow[] {
  const byRank = new Map<number, ChartRow>();
  for (const r of rows) {
    const cur = byRank.get(r.chartRank);
    if (!cur || r.reviewCount > cur.reviewCount) byRank.set(r.chartRank, r);
  }
  return [...byRank.values()];
}

import {
  apps,
  appSnapshots,
  appleSearchAds,
  creators,
  dbAll,
  dbGet,
  isPostgres,
  metaAds,
  toFtsMatch,
} from "@kittie/db";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import type { AppSearchParams, Store } from "@kittie/types";
import { getDb } from "../lib/db.js";

/** Drop in-memory list/sparkline/rank caches so Explore picks up new snapshot days. */
export function invalidateAppReadCaches(): void {
  cachedMaxDate.clear();
  cachedRevenueReady.clear();
  cachedCategoryFacets = null;
}

// Upper bound on apps materialized + scored per /apps request. Explore, Highlights
// and Rising only ever read the top slice of a sort, so we narrow to the top-N
// candidates in SQL (by the requested metric) and score only those. Scoring all
// ~1.1M apps in memory — what this path used to do — OOMs the heap.
const POOL_CAP = 5000;

// Crossover for the two app-column-filter candidate strategies (see selectCandidateIds):
//  - SEEK (matchCount ≤ this): materialize the ~matchCount filtered ids and seek their
//    pinned-day snapshots by (app_id IN …). Cost ∝ matchCount, so this wins for a SPARSE
//    filter (few matches) — the probe would otherwise scan deep into the day to collect
//    `cap` of them (e.g. Social Networking, 2% of apps → probe read ~125k rows, ~10s cold).
//  - PROBE (matchCount > this): the day-walk finds the top-`cap` fast when the filter is
//    DENSE (e.g. Games, 10% of apps → ~0.75s), and avoids materializing a huge id list.
// The probe reads ~cap·catalog/matchCount rows; the seek reads ~matchCount. They cross at
// matchCount ≈ √(cap·catalog) ≈ √(2500·1.1M) ≈ 52k, so 50k splits sparse↔dense cleanly.
const SEEK_MAX = 50_000;

// Per-query id-list size for the narrowed snapshot seek. drizzle builds the IN list by
// RECURSIVELY merging one sql chunk per param, so a ~20k+ single list overflows the call
// stack; 4000 keeps every chunk well within it while minimizing round-trips.
const NARROW_SEEK_CHUNK = 4_000;

/** Narrow the scored pool when filters already shrink the candidate universe. */
function effectivePoolCap(params: AppSearchParams): number {
  let cap = POOL_CAP;
  const now = Math.floor(Date.now() / 1000);
  if (params.releasedAfter != null) {
    const days = Math.max(1, (now - params.releasedAfter) / 86_400);
    if (days <= 14) cap = Math.min(cap, 400);
    else if (days <= 90) cap = Math.min(cap, 1_200);
    else if (days <= 400) cap = Math.min(cap, 2_500);
  }
  if (params.releasedBefore != null) cap = Math.min(cap, 2_500);
  if (params.growthType === "positive" || params.growthType === "negative") {
    cap = Math.min(cap, params.releasedAfter != null ? 1_800 : 2_500);
  }
  if (params.categories || params.excludedCategories) cap = Math.min(cap, 2_500);
  return cap;
}

// Latest snapshot day PER MARKET; apps are listed from their row on this day for
// the requested market (≈99% have one). Per-country so a market that ingests on a
// later day than US can't blank the US-pinned view (and vice-versa).
//
// TTL-bounded (ADR 0008): the snapshot writer is now a SEPARATE process, so this
// API process can't be signalled to invalidate when a new day lands. A short TTL
// makes the API pick up the worker's new snapshot day on its own within the window —
// without it, Explore would pin yesterday's day until an API restart, silently
// re-introducing staleness. `invalidateAppReadCaches()` still force-clears it for
// the in-process manual/CLI path.
const MAX_DATE_TTL_MS = 30 * 60_000;
const cachedMaxDate = new Map<string, { value: string | null; at: number }>();
const CATEGORY_FACET_TTL_MS = 30 * 60_000;
let cachedCategoryFacets: { value: CategoryFacet[]; at: number } | null = null;
const SNAPSHOT_LOOKBACK_DAYS = 14;
const MIN_COMPLETE_SNAPSHOT_ROWS = 1000;
const MIN_COMPLETE_SNAPSHOT_RATIO = 0.8;

export interface SnapshotDateCount {
  d: string;
  c: number;
}

export function chooseLatestCompleteSnapshotDate(
  rows: SnapshotDateCount[],
  options: { minRows?: number; minRatio?: number } = {},
): string | null {
  const newest = rows[0]?.d ?? null;
  if (!newest) return null;

  const bestCount = Math.max(...rows.map((r) => r.c));
  const minRows = options.minRows ?? MIN_COMPLETE_SNAPSHOT_ROWS;
  if (bestCount < minRows) return newest;

  const minRatio = options.minRatio ?? MIN_COMPLETE_SNAPSHOT_RATIO;
  const threshold = Math.max(minRows, Math.floor(bestCount * minRatio));
  return rows.find((r) => r.c >= threshold)?.d ?? newest;
}

// Whether the pinned day's revenue/downloads estimates are FULLY precomputed for a
// market — gates sqlSortColumn(revenue|downloads) onto the real column vs the reviewCount
// proxy. Refreshed (with the same TTL) whenever latestSnapshotDate recomputes the day.
// Defaults false → proxy, so a missing/partial backfill silently serves the slower-but-
// correct proxy order rather than ordering by a mostly-NULL column.
const cachedRevenueReady = new Map<string, { value: boolean; at: number }>();

function revenueColumnReady(country: string): boolean {
  return cachedRevenueReady.get(country)?.value ?? false;
}

async function refreshRevenueReady(country: string, maxDate: string | null): Promise<void> {
  if (!maxDate) {
    cachedRevenueReady.set(country, { value: false, at: Date.now() });
    return;
  }
  // Ready iff the pinned day has ZERO null revenue_estimate rows (a half-backfilled day
  // would order revenue by a mostly-null column). The (snapshot_date, revenue_estimate,
  // app_id) index makes the NULL range an index-only count.
  const [row] = await getDb()
    .select({ n: count() })
    .from(appSnapshots)
    .where(and(eq(appSnapshots.snapshotDate, maxDate), eq(appSnapshots.chartCountry, country), isNull(appSnapshots.revenueEstimate)));
  cachedRevenueReady.set(country, { value: (row?.n ?? 1) === 0, at: Date.now() });
}

async function latestSnapshotDate(country = "US"): Promise<string | null> {
  const hit = cachedMaxDate.get(country);
  if (hit && Date.now() - hit.at < MAX_DATE_TTL_MS) return hit.value;

  // Derive the latest *complete* snapshot day from apps.last_snapshot_date — O(catalog)
  // not app_snapshots — O(snapshots). Same chooseLatestCompleteSnapshotDate logic,
  // ~100× faster on a 1.1M-row snapshot table.
  const rows = await getDb()
    .select({ d: apps.lastSnapshotDate, c: count() })
    .from(apps)
    .where(sql`${apps.lastSnapshotDate} IS NOT NULL`)
    .groupBy(apps.lastSnapshotDate)
    .orderBy(desc(apps.lastSnapshotDate))
    .limit(SNAPSHOT_LOOKBACK_DAYS);
  const d = chooseLatestCompleteSnapshotDate(
    rows.filter((r): r is SnapshotDateCount => r.d != null).map((r) => ({ d: r.d!, c: r.c })),
  );
  cachedMaxDate.set(country, { value: d, at: Date.now() });
  await refreshRevenueReady(country, d);
  return d;
}

/** Comma-separated ISO market codes → de-blanked upper-case list. */
function parseCsvUpper(raw: string | undefined): string[] {
  return raw ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
}
/** The single market that scopes per-row snapshot reads — first requested country, else US. */
function marketCountryOf(params: AppSearchParams): string {
  return parseCsvUpper(params.countries)[0] ?? "US";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * SQL predicates for the apps ⋈ latest-snapshot query. We translate every *selective*
 * column filter — search / category (incl. exclude) / source / numeric ranges / dates /
 * price / languages / contact + ad/creator presence — so BOTH the count and the LIMITed
 * candidate pool reflect them (a pool-only filter would make the "X of Y" total lie and
 * silently drop low-review matches past POOL_CAP). Only the live-growth filters
 * (growthType, min/maxGrowth) — computed from in-memory scoring with no SQL column — stay
 * in matchesSearch. Every predicate here is a SUPERSET of its matchesSearch counterpart
 * (case-insensitive substring/JSON match), so matchesSearch remains the exact final pass.
 */
interface AppConditions {
  /** Predicates on the `apps` table — countable without joining to a snapshot. */
  appCols: SQL[];
  /** The always-on snapshot pin: latest day + the market (chart_country). */
  snapPin: SQL[];
  /** Selective snapshot-metric filters (rating/reviews/dl/rev ranges) — presence forces the join. */
  snapMetricCols: SQL[];
  /** True when a market was explicitly requested → the apps-only fast count is invalid. */
  explicitCountry: boolean;
  /** Single market scoping per-row snapshot reads (default "US"). */
  marketCountry: string;
}

function buildConditions(params: AppSearchParams, maxDate: string): AppConditions {
  const appCols: SQL[] = [];
  const snapMetricCols: SQL[] = [];

  // Per-country market dimension (ADR 0007). chart_country lives on the snapshot and
  // the table is now multi-row per app/day across markets, so EVERY read pins a single
  // market — otherwise an app holding rows in N markets is counted/listed N times. The
  // default is US (the catalog is 100% US today, so this is a no-op now); an explicit
  // `countries`/`excludedCountries` forces the join (the market genuinely narrows).
  const include = parseCsvUpper(params.countries);
  const exclude = parseCsvUpper(params.excludedCountries);
  const explicitCountry = include.length > 0 || exclude.length > 0;
  const marketCountry = include[0] ?? "US";

  const snapPin: SQL[] = [eq(appSnapshots.snapshotDate, maxDate)];
  if (include.length) snapPin.push(inArray(appSnapshots.chartCountry, include));
  else if (exclude.length) snapPin.push(notInArray(appSnapshots.chartCountry, exclude));
  else snapPin.push(eq(appSnapshots.chartCountry, marketCountry));

  if (params.search) {
    const q = `%${params.search.toLowerCase()}%`;
    const fields = params.textSearchFields
      ? params.textSearchFields.split(",").map((f) => f.trim().toLowerCase())
      : ["title", "developer", "description"];
    const ors: SQL[] = [];
    if (fields.includes("title")) ors.push(like(sql`lower(${apps.title})`, q));
    if (fields.includes("developer")) ors.push(like(sql`lower(${apps.developer})`, q));
    if (fields.includes("description")) ors.push(like(sql`lower(${apps.description})`, q));
    if (ors.length) appCols.push(or(...ors)!);
  }
  if (params.categories) {
    // Exact match (not lower()) so apps_category_idx is usable — the UI sources
    // categories from listCategories (stored casing), so it always sends exact
    // values. matchesSearch stays case-insensitive as the authoritative pass.
    const cats = params.categories.split(",").map((c) => c.trim()).filter(Boolean);
    if (cats.length) appCols.push(inArray(apps.category, cats));
  }
  if (params.excludedCategories) {
    const ex = params.excludedCategories.split(",").map((c) => c.trim()).filter(Boolean);
    // Keep null-category apps (matchesSearch only excludes when item.category is set),
    // so the SQL stays a superset of the authoritative pass.
    if (ex.length) appCols.push(or(isNull(apps.category), notInArray(apps.category, ex))!);
  }
  if (params.source) appCols.push(eq(apps.store, params.source));
  if (params.excludedSource) appCols.push(ne(apps.store, params.excludedSource));
  if (params.developer) appCols.push(like(sql`lower(${apps.developer})`, `%${params.developer.toLowerCase()}%`));

  if (params.minRating != null) snapMetricCols.push(gte(sql`coalesce(${appSnapshots.rating}, 0)`, params.minRating));
  if (params.maxRating != null) snapMetricCols.push(lte(sql`coalesce(${appSnapshots.rating}, 0)`, params.maxRating));
  if (params.minReviews != null) snapMetricCols.push(gte(appSnapshots.reviewCount, params.minReviews));
  if (params.maxReviews != null) snapMetricCols.push(lte(appSnapshots.reviewCount, params.maxReviews));
  if (params.minDownloads != null) snapMetricCols.push(gte(sql`coalesce(${appSnapshots.downloadsEstimate}, 0)`, params.minDownloads));
  if (params.maxDownloads != null) snapMetricCols.push(lte(sql`coalesce(${appSnapshots.downloadsEstimate}, 0)`, params.maxDownloads));
  if (params.minRevenue != null) snapMetricCols.push(gte(sql`coalesce(${appSnapshots.revenueEstimate}, 0)`, params.minRevenue));
  if (params.maxRevenue != null) snapMetricCols.push(lte(sql`coalesce(${appSnapshots.revenueEstimate}, 0)`, params.maxRevenue));

  if (params.releasedAfter != null) appCols.push(gte(apps.releasedAt, new Date(params.releasedAfter * 1000)));
  if (params.releasedBefore != null) appCols.push(lte(apps.releasedAt, new Date(params.releasedBefore * 1000)));
  if (params.updatedAfter != null) appCols.push(gte(apps.updatedAt, new Date(params.updatedAfter * 1000)));
  if (params.updatedBefore != null) appCols.push(lte(apps.updatedAt, new Date(params.updatedBefore * 1000)));

  if (params.priceType === "free") appCols.push(or(isNull(apps.price), lte(apps.price, 0))!);
  if (params.priceType === "paid") appCols.push(and(isNotNull(apps.price), gt(apps.price, 0))!);

  if (params.hasEmails === true) appCols.push(and(isNotNull(apps.supportEmail), ne(apps.supportEmail, ""))!);
  if (params.hasWebsite === true) appCols.push(and(isNotNull(apps.websiteUrl), ne(apps.websiteUrl, ""))!);

  // App language — languages is a JSON array of uppercase ISO codes (`["EN","FR"]`).
  // Match if the app supports ANY requested code; quote-wrap so "en" can't match a
  // longer token. Superset of matchesSearch's exact parseJsonArray().includes() pass.
  if (params.languages) {
    // Strip LIKE metacharacters (%/_) from each ISO code so a crafted value can't widen
    // the candidate pool into a wildcard scan. Codes are alphanumeric, so this is lossless.
    const want = params.languages
      .split(",")
      .map((l) => l.trim().toLowerCase().replace(/[%_]/g, ""))
      .filter(Boolean);
    const ors = want.map((l) => like(sql`lower(${apps.languages})`, `%"${l}"%`));
    if (ors.length) appCols.push(or(...ors)!);
  }

  // Ad / creator presence — EXISTS against the source tables so the count + pool reflect
  // them (these tables are un-ingested today → `true` honestly yields 0; both predicates
  // light up automatically once ingest lands, with no further change here).
  if (params.hasMetaAds === true) appCols.push(sql`exists (select 1 from ${metaAds} where ${metaAds.appId} = ${apps.id})`);
  if (params.hasMetaAds === false) appCols.push(sql`not exists (select 1 from ${metaAds} where ${metaAds.appId} = ${apps.id})`);
  if (params.hasAppleAds === true) appCols.push(sql`exists (select 1 from ${appleSearchAds} where ${appleSearchAds.appId} = ${apps.id})`);
  if (params.hasAppleAds === false) appCols.push(sql`not exists (select 1 from ${appleSearchAds} where ${appleSearchAds.appId} = ${apps.id})`);
  if (params.hasCreators === true) appCols.push(sql`exists (select 1 from ${creators} where ${creators.appId} = ${apps.id})`);
  if (params.hasCreators === false) appCols.push(sql`not exists (select 1 from ${creators} where ${creators.appId} = ${apps.id})`);

  return { appCols, snapPin, snapMetricCols, explicitCountry, marketCountry };
}

/** Flattened predicate list for the joined candidate query. */
function allConditions(c: AppConditions): SQL[] {
  return [...c.snapPin, ...c.snapMetricCols, ...c.appCols];
}

/**
 * Sort columns whose STORED value is authoritative, so the candidate pool can be the
 * true top-N in SQL. revenue/downloads/growth/trending/rankDelta are computed live in
 * scoring (their snapshot columns are unpopulated for ~all apps), so they have no SQL
 * column — selectCandidateIds proxies them by review count (busiest apps ≈ where the
 * top earners / movers are) and sortApps re-orders the pool by the exact live value.
 */
function sqlSortColumn(params: AppSearchParams): AnyColumn | null {
  switch (params.sortBy) {
    case "reviews":
      return appSnapshots.reviewCount;
    case "rating":
      return appSnapshots.rating;
    case "updated":
      return apps.updatedAt;
    case "released":
    case "newest":
      return apps.releasedAt;
    // revenue/downloads are modelled live, BUT the snapshot worker/backfill now persists
    // them onto every row of the pinned complete day. When that day is fully backfilled
    // (revenueColumnReady), order by the stored column directly — the candidate pool
    // becomes the true top-N revenue/downloads (more accurate than the old reviewCount
    // proxy: it surfaces high-revenue/low-review apps the proxy pool excluded), and the
    // keyset path makes it a LIMIT-50 scan. Unbackfilled day → proxy (correct, slower).
    case "revenue":
      return revenueColumnReady(marketCountryOf(params)) ? appSnapshots.revenueEstimate : null;
    case "downloads":
      return revenueColumnReady(marketCountryOf(params)) ? appSnapshots.downloadsEstimate : null;
    // growth/trending stay live: sortApps recomputes growthScore at read time (period-
    // dependent), so the stored growth_score column would not match the display order.
    default:
      return null;
  }
}

/** True when the candidate pool is already in the final display order — i.e. the sort
 *  is a real SQL column (not a live-modelled estimate) and DESC (SQLite sinks NULLs to
 *  the bottom of a DESC scan, matching sortApps' null-sink; ASC would diverge at the
 *  NULL boundary). Lets searchAppsFromDb score only the requested page, not the whole
 *  ~5000-row pool. */
export function poolIsInFinalOrder(params: AppSearchParams): boolean {
  return sqlSortColumn(params) !== null && (params.sortOrder ?? "desc") === "desc";
}

async function countMatches(c: AppConditions): Promise<number> {
  const db = getDb();
  // No snapshot-metric filter AND no explicit market → the count is decided by the
  // apps table (the default US market is ≈the whole catalog). Skip the join entirely
  // (it was the 4s cost on filtered loads). An EXPLICIT market — even `country=US` —
  // keeps the exact join semantics below (apps lacking a pinned-day snapshot row must
  // not inflate the total), served by the index-probe count in the last branch.
  if (c.snapMetricCols.length === 0 && !c.explicitCountry) {
    if (c.appCols.length === 0) {
      // Unfiltered → count the latest-day rows for the default market straight off.
      const [row] = await db.select({ c: count() }).from(appSnapshots).where(and(...c.snapPin));
      return row?.c ?? 0;
    }
    // apps-column filters only (category/source/developer/price/…) → count off the
    // apps indexes. Ignores the <1% of matches lacking a latest-day snapshot, which
    // is within display tolerance for a "X of Y" total.
    const [row] = await db.select({ c: count() }).from(apps).where(and(...c.appCols));
    return row?.c ?? 0;
  }
  // A snapshot-metric filter (or explicit market) forced us past the apps-only count.
  // When there are NO apps-table column filters, the apps join only re-derives the
  // app_id the snapshot row already carries — count distinct app_id straight off
  // app_snapshots. The (snapshot_date, rating, app_id) covering index serves a minRating
  // count index-only (~8× faster: ~0.15s vs ~1.2s on a 1.1M-row day).
  if (c.appCols.length === 0) {
    const [row] = await db
      .select({ c: countDistinct(appSnapshots.appId) })
      .from(appSnapshots)
      .where(and(...c.snapPin, ...c.snapMetricCols));
    return row?.c ?? 0;
  }
  // An apps-column filter (category/source/developer/…) is also present. Same number as
  // countDistinct(apps.id) over the apps ⋈ app_snapshots join for EVERY input (inner join
  // on app_id equality ⇒ distinct apps.id == distinct snapshot app_id within the filtered
  // id set), but expressed as an IN-subquery so SQLite drives from the filtered app-id
  // list and probes the COVERING snapshots_app_date_country_idx — index-only seeks,
  // cost ∝ filter matches instead of the ~12s cold apps-probe-per-day-row join it
  // replaces (the dominant cost of a category+country=US Trends/Explore count).
  const [row] = await db
    .select({ c: countDistinct(appSnapshots.appId) })
    .from(appSnapshots)
    .where(
      and(
        ...c.snapPin,
        ...c.snapMetricCols,
        inArray(appSnapshots.appId, db.select({ id: apps.id }).from(apps).where(and(...c.appCols))),
      ),
    );
  return row?.c ?? 0;
}

/** Candidate ids plus, when the branch derives it for free, the EXACT match total. */
interface CandidateSelection {
  ids: string[];
  /** Set ONLY when it equals the exact countDistinct(apps.id) join total AND countMatches
   *  would have computed that same join total (explicit market, no metric filter): the
   *  seek branch touches every pinned-day row for the filtered id set anyway, so its
   *  distinct-id tally IS the join count — reusing it skips a redundant O(matches) count
   *  round-trip. Never set on the default no-country path: there countMatches keeps its
   *  pre-existing apps-only tolerance count, which this exact tally would CHANGE. */
  exactTotal?: number;
}

/** Top-N candidate app ids, narrowed + ordered in SQL so memory stays bounded. For
 *  live-growth sorts (no SQL column) we proxy by review count — the busiest apps are
 *  where the movers are — then re-sort the pool exactly in memory. */
async function selectCandidateIds(c: AppConditions, params: AppSearchParams): Promise<CandidateSelection> {
  const conds = allConditions(c);

  // rankDelta has no stored column AND a review-count proxy picks the wrong apps (the
  // biggest chart movers aren't the most-reviewed). Only charting apps can have a delta,
  // and the charted set (~4k) fits under POOL_CAP — so pool ALL of them and let sortApps
  // order by the live delta. This makes Highlights gainers/losers exact, not approximate.
  if (params.sortBy === "rankDelta") {
    conds.push(isNotNull(appSnapshots.chartRank));
    const rows = await getDb()
      .select({ id: apps.id })
      .from(apps)
      .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
      .where(and(...conds))
      .orderBy(asc(appSnapshots.chartRank), apps.id)
      .limit(effectivePoolCap(params));
    // Dedupe: an app charting in several requested markets yields one row per market.
    return { ids: [...new Set(rows.map((r) => r.id))] };
  }

  const sqlCol = sqlSortColumn(params);
  const col = sqlCol ?? appSnapshots.reviewCount;
  const dir = (params.sortOrder ?? "desc") === "asc" ? asc : desc;
  const cap = effectivePoolCap(params);
  // The snapshot-only seek can order by `col` iff it lives on app_snapshots (it selects
  // FROM app_snapshots without joining apps). Live-modelled/reviews sorts proxy on
  // review_count (snapshot); updated/released sort on apps columns → keep the join path.
  const colIsSnapshot = sqlCol == null || sqlCol === appSnapshots.rating || sqlCol === appSnapshots.reviewCount || sqlCol === appSnapshots.revenueEstimate || sqlCol === appSnapshots.downloadsEstimate;

  // Selective app-column filters (releasedAt window, category, …) can match ≪1% of
  // the catalog. Joining snapshot-first scans every row on the latest day (~1.1M);
  // apps-first + inArray keeps the join bounded to the filtered id set.
  if (c.appCols.length > 0 && c.snapMetricCols.length === 0) {
    const db = getDb();
    const [countRow] = await db.select({ c: count() }).from(apps).where(and(...c.appCols));
    const matchCount = countRow?.c ?? 0;
    if (matchCount > 0 && matchCount <= SEEK_MAX && colIsSnapshot) {
      const narrowed = await db.select({ id: apps.id }).from(apps).where(and(...c.appCols));
      const narrowIds = narrowed.map((r) => r.id);
      // Seek app_snapshots by the narrowed app-id set on the pinned day, NOT the day-walk
      // the join+ORDER-BY planned before: ordering by the sort column let SQLite start from
      // snapshots_date_reviews_idx and scan the WHOLE day (~1.1M rows) filtering category as
      // a residual — 6-9s cold for a SPARSE mid-size category (e.g. Social Networking, 21k
      // apps). An (app_id IN …) seek on snapshots_app_date_country_idx touches only the
      // ~matchCount narrowed rows (index-only, ~0.8s cold), and we take the top-`cap` by the
      // sort column in memory (sort is O(matchCount), trivial). Same rows/order as before.
      // Chunked so a large id set stays under drizzle's IN-list recursion limit.
      const snapRows: Array<{ id: string; v: number | null }> = [];
      for (const part of chunk(narrowIds, NARROW_SEEK_CHUNK)) {
        const partRows = await db
          .select({ id: appSnapshots.appId, v: sql<number | null>`${col}` })
          .from(appSnapshots)
          .where(and(...c.snapPin, inArray(appSnapshots.appId, part)));
        snapRows.push(...partRows);
      }
      const isAsc = (params.sortOrder ?? "desc") === "asc";
      // Reproduce the exact order the replaced SQL (ORDER BY dir(col), app_id ASC) yielded,
      // so the pool this feeds is byte-identical: SQLite sorts NULLs FIRST on ASC and LAST
      // on DESC; ties break on app_id ASC. sortApps re-sorts the pool afterward, but matching
      // here keeps pool MEMBERSHIP (which ids survive the `cap` cut) identical too.
      const idCmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      snapRows.sort((a, b) => {
        if (a.v == null && b.v == null) return idCmp(a.id, b.id);
        if (a.v == null) return isAsc ? -1 : 1;
        if (b.v == null) return isAsc ? 1 : -1;
        if (a.v !== b.v) return isAsc ? a.v - b.v : b.v - a.v;
        return idCmp(a.id, b.id);
      });
      const out: string[] = [];
      const seen = new Set<string>();
      for (const r of snapRows) {
        if (seen.has(r.id)) continue; // dedupe multi-market
        seen.add(r.id);
        if (out.length < cap) out.push(r.id);
      }
      // seen now holds EVERY distinct pinned-day app id in the filtered set (the loop
      // ran past the cap) == the exact join count. Only offered when an explicit market
      // keeps countMatches on join semantics (see CandidateSelection).
      return { ids: out, exactTotal: c.explicitCountry ? seen.size : undefined };
    }
    // Small filter but the sort column lives on `apps` (updated/released) — the snapshot-only
    // seek can't order by it, so keep the original apps-first join with inArray (bounded to
    // the narrowed id set), unchanged from before this fix. Held to the original cap*3 bound
    // because a single inArray of that many ids overflows drizzle's IN-list recursion.
    if (matchCount > 0 && matchCount <= cap * 3) {
      const narrowed = await db.select({ id: apps.id }).from(apps).where(and(...c.appCols));
      const narrowIds = narrowed.map((r) => r.id);
      const rows = await db
        .select({ id: apps.id })
        .from(apps)
        .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
        .where(and(...c.snapPin, inArray(apps.id, narrowIds)))
        .orderBy(dir(col), apps.id)
        .limit(cap);
      return { ids: [...new Set(rows.map((r) => r.id))] };
    }
    // Dense app-only filter (matches a large fraction of the catalog, e.g. a top category
    // or a wide Rising release window) — the day-walk finds the top-`cap` by the sort proxy
    // quickly (dense ⇒ shallow scan) and avoids materializing a huge id list. Applies the
    // app predicates during the scan, avoiding a full 1M-row join+filter.
    if (matchCount > SEEK_MAX) {
      const probe = Math.min(2_500, cap * 2);
      const rows = await db
        .select({ id: apps.id })
        .from(appSnapshots)
        .innerJoin(apps, eq(appSnapshots.appId, apps.id))
        .where(and(...c.snapPin, ...c.appCols))
        .orderBy(dir(col), apps.id)
        .limit(probe);
      return { ids: [...new Set(rows.map((r) => r.id))] };
    }
  }

  // No `col IS NULL` term: SQLite already sorts NULLs to the bottom of a DESC scan,
  // and sortApps applies the authoritative null-sink to the pool afterwards. Keeping
  // the order a plain column lets the (snapshot_date, review_count) index serve it
  // without a sort.
  const rows = await getDb()
    .select({ id: apps.id })
    .from(apps)
    .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
    .where(and(...conds))
    .orderBy(dir(col), apps.id)
    .limit(cap);
  return { ids: [...new Set(rows.map((r) => r.id))] };
}

/**
 * Search candidate pool: an FTS5 MATCH on title/developer INTERSECTED with the SQL
 * filters (category / source / numeric ranges / latest-day pin), most-relevant first.
 * Applying the filters DURING selection — not just in matchesSearch afterward — keeps
 * filtered matches that rank beyond POOL_CAP, which a text-only FTS pool would drop.
 */
async function ftsCandidateIds(match: string, filter: SQL, cap: number): Promise<string[]> {
  const rows = await dbAll<{ id: string }>(getDb(), sql`
    SELECT apps.id AS id
    FROM apps_fts
    JOIN apps ON apps.id = apps_fts.app_id
    JOIN app_snapshots ON app_snapshots.app_id = apps.id
    WHERE apps_fts MATCH ${match} AND ${filter}
    ORDER BY apps_fts.rank, apps.id
    LIMIT ${cap}
  `);
  // Dedupe: the snapshot join yields one row per market for multi-market requests.
  return [...new Set(rows.map((r) => r.id))];
}

/** Total apps matching the search text AND the SQL filters — the accurate "X of Y" count. */
async function ftsCount(match: string, filter: SQL): Promise<number> {
  const row = await dbGet<{ c: number }>(getDb(), sql`
    SELECT count(distinct apps.id) AS c
    FROM apps_fts
    JOIN apps ON apps.id = apps_fts.app_id
    JOIN app_snapshots ON app_snapshots.app_id = apps.id
    WHERE apps_fts MATCH ${match} AND ${filter}
  `);
  return Number(row?.c ?? 0);
}

export interface AppCandidatePool {
  totalCount: number;
  ids: string[];
  marketCountry: string;
}

/** SQL + FTS candidate selection for App search — bounded by POOL_CAP. */
export async function searchAppCandidates(params: AppSearchParams): Promise<AppCandidatePool | null> {
  const marketCountry = marketCountryOf(params);
  const maxDate = await latestSnapshotDate(marketCountry);
  if (!maxDate) return null;

  const search = params.search?.trim();
  // FTS5 (apps_fts / MATCH) is SQLite-only. On pg the virtual table doesn't exist, so
  // force the non-FTS branch — buildConditions already applies a portable LIKE on the
  // search text, so results stay correct (native pg full-text is #244). (#245)
  const ftsMatch = search && !isPostgres(getDb()) ? toFtsMatch(search) : null;
  const conds = buildConditions(params, maxDate);
  let totalCount: number;
  let ids: string[];
  if (ftsMatch) {
    const filter = and(...allConditions(conds))!;
    const cap = effectivePoolCap(params);
    [totalCount, ids] = await Promise.all([ftsCount(ftsMatch, filter), ftsCandidateIds(ftsMatch, filter, cap)]);
  } else {
    // Candidates first: the seek branch derives the exact join total as a byproduct
    // (see CandidateSelection), letting the hot Trends/Explore category+market load skip
    // countMatches entirely. When it can't, count afterwards — running it sequentially
    // costs no more wall time than the old Promise.all (the two queries contended for
    // the same cold pages) and keeps the fast path from paying for both.
    const sel = await selectCandidateIds(conds, params);
    ids = sel.ids;
    totalCount = sel.exactTotal ?? (await countMatches(conds));
  }
  return { totalCount, ids, marketCountry };
}

// ── Keyset pagination fast-path ──────────────────────────────────────────────
// For SQL-native DESC sorts whose raw column orders BYTE-IDENTICALLY to sortApps, we
// paginate in SQL with a (sortValue, app_id) boundary + LIMIT pageSize, instead of
// materialising the 5000-row POOL_CAP pool and slicing it. The candidate scan drops
// from ~5000 rows to ~50, cutting cold p95 several-fold.
export type KeysetCursor = { sortValue: number | null; appId: string };

/** The column to keyset by when it orders byte-identically to the legacy sortApps path,
 *  else null (→ caller keeps the legacy pool path).
 *  - reviews: raw review_count null-sinks exactly like sortApps' raw sortValue.
 *  - rating: raw rating == sortApps' (rating ?? 0) ONLY when minRating>0 excludes the
 *    540k zero-rated + null-rated apps; otherwise the 0/NULL tail diverges, so legacy.
 *  - revenue/downloads: served once the pin day's estimates are precomputed (Tranche B);
 *    until then sqlSortColumn returns null for them so this never fires.
 *  updated/released are excluded: sortApps coalesces their NULL date to epoch 0. */
export function keysetColumn(params: AppSearchParams): AnyColumn | null {
  // Both directions are keyset-eligible because every column below is NON-NULL in its
  // eligible context (review_count is never null; rating only when minRating>0 excludes
  // the NULL/0 tail; revenue/downloads only when the day is fully backfilled). With no
  // NULLs there's no null-sink divergence, so ASC matches sortApps too (SQLite's ASC
  // NULLs-first would otherwise disagree with sortApps' unconditional null-sink).
  switch (params.sortBy) {
    case "reviews":
      return appSnapshots.reviewCount;
    case "rating":
      return params.minRating != null && params.minRating > 0 ? appSnapshots.rating : null;
    case "revenue":
      return sqlSortColumn(params) === appSnapshots.revenueEstimate ? appSnapshots.revenueEstimate : null;
    case "downloads":
      return sqlSortColumn(params) === appSnapshots.downloadsEstimate ? appSnapshots.downloadsEstimate : null;
    default:
      return null;
  }
}

/** Top `pageSize` candidates after the keyset boundary, in (col DESC, app_id ASC) order
 *  — the exact order the legacy pool path produces, bounded to one page. Returns each
 *  id WITH its sort-column value, so the next cursor is built from the SAME column the
 *  scan ordered by (not from the scored item, whose value can come from a newer partial
 *  snapshot day than the pinned candidate day — that mismatch re-emits boundary rows). */
async function selectCandidateIdsKeyset(
  c: AppConditions,
  params: AppSearchParams,
  cursor: KeysetCursor | null,
  pageSize: number,
): Promise<Array<{ id: string; sortVal: number | null }>> {
  const col = keysetColumn(params)!;
  const isAsc = (params.sortOrder ?? "desc") === "asc";
  const conds = allConditions(c);
  if (cursor) {
    // Built with drizzle or()/and() (NOT a raw sql`(X) OR (Y)` chunk — that doesn't
    // parenthesize as a unit inside the outer and(), so the OR escapes the date/market
    // pin and re-emits boundary rows). Tiebreak on app_snapshots.app_id ASC (the indexed
    // column), so the cursor comparison + ORDER BY are served index-only — using the
    // joined apps.id instead forces a temp b-tree over big tie-groups (e.g. rating).
    if (cursor.sortValue === null) {
      // Boundary on a NULL col value (only reachable for a nullable DESC sort; the
      // asc-eligible columns are non-null). NULLs are the last DESC block, ordered by id.
      conds.push(and(isNull(col), gt(appSnapshots.appId, cursor.appId))!);
    } else {
      // Strictly after (sortValue, app_id): for DESC that's a smaller col, for ASC a
      // larger col; ties advance by app_id ASC. NULL cols never satisfy the inequality.
      const afterCol = isAsc ? gt(col, cursor.sortValue) : lt(col, cursor.sortValue);
      conds.push(or(afterCol, and(eq(col, cursor.sortValue), gt(appSnapshots.appId, cursor.appId)))!);
    }
  }
  const rows = await getDb()
    .select({ id: apps.id, sortVal: sql<number | null>`${col}` })
    .from(apps)
    .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
    .where(and(...conds))
    .orderBy(isAsc ? asc(col) : desc(col), appSnapshots.appId)
    .limit(pageSize);
  const seen = new Set<string>();
  const out: Array<{ id: string; sortVal: number | null }> = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue; // dedupe multi-market join
    seen.add(r.id);
    out.push({ id: r.id, sortVal: r.sortVal ?? null });
  }
  return out;
}

export interface KeysetPool {
  totalCount: number;
  ids: string[];
  /** id → the candidate scan's sort-column value, for building the next cursor. */
  sortValues: Map<string, number | null>;
  marketCountry: string;
}

/** Keyset variant of searchAppCandidates: totalCount (unchanged) in parallel with a
 *  single-page keyset scan. Only valid when keysetColumn(params) != null and the query
 *  has no FTS/in-memory-dropping filter (caller gates via canUseKeyset). */
export async function searchAppCandidatesKeyset(
  params: AppSearchParams,
  cursor: KeysetCursor | null,
  pageSize: number,
): Promise<KeysetPool | null> {
  const marketCountry = marketCountryOf(params);
  const maxDate = await latestSnapshotDate(marketCountry);
  if (!maxDate) return null;
  const conds = buildConditions(params, maxDate);
  const [totalCount, cand] = await Promise.all([
    countMatches(conds),
    selectCandidateIdsKeyset(conds, params, cursor, pageSize),
  ]);
  return {
    totalCount,
    ids: cand.map((r) => r.id),
    sortValues: new Map(cand.map((r) => [r.id, r.sortVal])),
    marketCountry,
  };
}

/** FTS keyset candidate: the apps_fts MATCH ∩ SQL filters, ordered by the SORT column
 *  (not bm25 rank) + a (sortValue, app_id) keyset boundary, LIMIT pageSize. Lets a search
 *  with a keyset-eligible sort score only the page instead of the 5000-row relevance pool.
 *  For terms with ≤ POOL_CAP matches this is byte-identical to the legacy path (both
 *  consider every match); for heavier terms it ranks over ALL matches, not the top-5000-
 *  by-relevance (a sanctioned ranking change, like the revenue precompute). */
async function ftsCandidateKeyset(
  match: string,
  filter: SQL,
  col: AnyColumn,
  isAsc: boolean,
  cursor: KeysetCursor | null,
  pageSize: number,
): Promise<Array<{ id: string; sortVal: number | null }>> {
  let keyset = sql``;
  if (cursor && cursor.sortValue !== null) {
    const afterCol = isAsc ? sql`${col} > ${cursor.sortValue}` : sql`${col} < ${cursor.sortValue}`;
    keyset = sql` AND ((${afterCol}) OR (${col} = ${cursor.sortValue} AND app_snapshots.app_id > ${cursor.appId}))`;
  }
  const order = isAsc ? sql`asc` : sql`desc`;
  const rows = await dbAll<{ id: string; sortVal: number | null }>(getDb(), sql`
    SELECT apps.id AS id, ${col} AS sortVal
    FROM apps_fts
    JOIN apps ON apps.id = apps_fts.app_id
    JOIN app_snapshots ON app_snapshots.app_id = apps.id
    WHERE apps_fts MATCH ${match} AND ${filter}${keyset}
    ORDER BY ${col} ${order}, app_snapshots.app_id ASC
    LIMIT ${pageSize}
  `);
  const seen = new Set<string>();
  const out: Array<{ id: string; sortVal: number | null }> = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, sortVal: r.sortVal ?? null });
  }
  return out;
}

/** Keyset variant for FTS search: ftsCount (unchanged "X of Y") in parallel with a
 *  single-page FTS keyset scan ordered by the sort column. Caller gates via
 *  searchKeysetSafe(params) && keysetColumn(params) != null. */
export async function searchAppCandidatesKeysetFts(
  params: AppSearchParams,
  cursor: KeysetCursor | null,
  pageSize: number,
): Promise<KeysetPool | null> {
  const marketCountry = marketCountryOf(params);
  const maxDate = await latestSnapshotDate(marketCountry);
  if (!maxDate) return null;
  const search = params.search?.trim();
  // FTS5 keyset path is SQLite-only; on pg return null so the caller falls back to the
  // legacy non-FTS pool path (which searches via the portable LIKE conditions). (#245)
  const ftsMatch = search && !isPostgres(getDb()) ? toFtsMatch(search) : null;
  const col = keysetColumn(params);
  if (!ftsMatch || !col) return null;
  const conds = buildConditions(params, maxDate);
  const filter = and(...allConditions(conds))!;
  const isAsc = (params.sortOrder ?? "desc") === "asc";
  const [totalCount, cand] = await Promise.all([
    ftsCount(ftsMatch, filter),
    ftsCandidateKeyset(ftsMatch, filter, col, isAsc, cursor, pageSize),
  ]);
  return {
    totalCount,
    ids: cand.map((r) => r.id),
    sortValues: new Map(cand.map((r) => [r.id, r.sortVal])),
    marketCountry,
  };
}

export interface CategoryFacet {
  name: string;
  stores: Store[];
}

export async function listCategoryFacetsFromDb(): Promise<CategoryFacet[]> {
  if (cachedCategoryFacets && Date.now() - cachedCategoryFacets.at < CATEGORY_FACET_TTL_MS) {
    return cachedCategoryFacets.value;
  }

  const rows = await getDb().select({ category: apps.category, store: apps.store }).from(apps);
  const map = new Map<string, Set<Store>>();
  for (const r of rows) {
    if (!r.category) continue;
    const set = map.get(r.category) ?? new Set<Store>();
    set.add(r.store as Store);
    map.set(r.category, set);
  }
  const facets = [...map.entries()]
    .map(([name, stores]) => ({ name, stores: [...stores] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedCategoryFacets = { value: facets, at: Date.now() };
  return facets;
}

export async function getRankDeltasFor(ids: string[], country = "US"): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const db = getDb();
  for (const part of chunk(ids, 400)) {
    const rows = await db
      .select({ appId: appSnapshots.appId, chartRank: appSnapshots.chartRank })
      .from(appSnapshots)
      .where(and(inArray(appSnapshots.appId, part), eq(appSnapshots.chartCountry, country)))
      .orderBy(appSnapshots.appId, appSnapshots.snapshotDate);

    const lastTwo = new Map<string, number[]>();
    for (const row of rows) {
      if (row.chartRank == null) continue;
      const list = lastTwo.get(row.appId);
      if (!list) lastTwo.set(row.appId, [row.chartRank]);
      else {
        list.push(row.chartRank);
        if (list.length > 2) list.shift();
      }
    }
    for (const [appId, ranks] of lastTwo) {
      if (ranks.length === 2) map.set(appId, ranks[0]! - ranks[1]!);
    }
  }
  return map;
}

export async function getSparklinesFor(ids: string[], country = "US"): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (!ids.length) return map;
  const db = getDb();
  for (const part of chunk(ids, 400)) {
    const rows = await db
      .select({ appId: appSnapshots.appId, reviewCount: appSnapshots.reviewCount })
      .from(appSnapshots)
      .where(and(inArray(appSnapshots.appId, part), eq(appSnapshots.chartCountry, country)))
      .orderBy(appSnapshots.appId, appSnapshots.snapshotDate);
    for (const row of rows) {
      const list = map.get(row.appId);
      if (!list) map.set(row.appId, [row.reviewCount]);
      else {
        list.push(row.reviewCount);
        if (list.length > 7) list.shift();
      }
    }
  }
  return map;
}

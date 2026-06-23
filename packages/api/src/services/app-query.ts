import {
  apps,
  appSnapshots,
  appleSearchAds,
  creators,
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
  cachedCategoryFacets = null;
}

// Upper bound on apps materialized + scored per /apps request. Explore, Highlights
// and Rising only ever read the top slice of a sort, so we narrow to the top-N
// candidates in SQL (by the requested metric) and score only those. Scoring all
// ~1.1M apps in memory — what this path used to do — OOMs the heap.
const POOL_CAP = 5000;

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
function sqlSortColumn(sortBy: AppSearchParams["sortBy"]): AnyColumn | null {
  switch (sortBy) {
    case "reviews":
      return appSnapshots.reviewCount;
    case "rating":
      return appSnapshots.rating;
    case "updated":
      return apps.updatedAt;
    case "released":
    case "newest":
      return apps.releasedAt;
    // downloads/revenue/growth/trending are MODELLED live at read time — the stored
    // estimate columns are null for ~99.7% of snapshots, so ordering the pool by them
    // yields an arbitrary (rowid) slice. Fall through to the reviewCount proxy (a real
    // popularity correlate); sortApps then applies the true live order in memory.
    // Proper fix would require persisting the estimates at snapshot time.
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
  return sqlSortColumn(params.sortBy) !== null && (params.sortOrder ?? "desc") === "desc";
}

async function countMatches(c: AppConditions): Promise<number> {
  const db = getDb();
  // No snapshot-metric filter AND no explicit market → the count is decided by the
  // apps table (the default US market is ≈the whole catalog). Skip the join entirely
  // (it was the 4s cost on filtered loads).
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
  // An apps-column filter (category/source/developer/…) is also present → the join is
  // unavoidable. countDistinct(apps.id) so an app charting in several requested markets
  // is counted once.
  const [row] = await db
    .select({ c: countDistinct(apps.id) })
    .from(apps)
    .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
    .where(and(...allConditions(c)));
  return row?.c ?? 0;
}

/** Top-N candidate app ids, narrowed + ordered in SQL so memory stays bounded. For
 *  live-growth sorts (no SQL column) we proxy by review count — the busiest apps are
 *  where the movers are — then re-sort the pool exactly in memory. */
async function selectCandidateIds(c: AppConditions, params: AppSearchParams): Promise<string[]> {
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
    return [...new Set(rows.map((r) => r.id))];
  }

  const col = sqlSortColumn(params.sortBy) ?? appSnapshots.reviewCount;
  const dir = (params.sortOrder ?? "desc") === "asc" ? asc : desc;
  const cap = effectivePoolCap(params);

  // Selective app-column filters (releasedAt window, category, …) can match ≪1% of
  // the catalog. Joining snapshot-first scans every row on the latest day (~1.1M);
  // apps-first + inArray keeps the join bounded to the filtered id set.
  if (c.appCols.length > 0 && c.snapMetricCols.length === 0) {
    const db = getDb();
    const [countRow] = await db.select({ c: count() }).from(apps).where(and(...c.appCols));
    const matchCount = countRow?.c ?? 0;
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
      return [...new Set(rows.map((r) => r.id))];
    }
    // Large app-only filter (e.g. Rising 6M window) — probe top snapshot rows by the
    // sort proxy, then apply app predicates, avoiding a full 1M-row join+filter.
    if (matchCount > cap * 3) {
      const probe = Math.min(2_500, cap * 2);
      const rows = await db
        .select({ id: apps.id })
        .from(appSnapshots)
        .innerJoin(apps, eq(appSnapshots.appId, apps.id))
        .where(and(...c.snapPin, ...c.appCols))
        .orderBy(dir(col), apps.id)
        .limit(probe);
      return [...new Set(rows.map((r) => r.id))];
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
  return [...new Set(rows.map((r) => r.id))];
}

/**
 * Search candidate pool: an FTS5 MATCH on title/developer INTERSECTED with the SQL
 * filters (category / source / numeric ranges / latest-day pin), most-relevant first.
 * Applying the filters DURING selection — not just in matchesSearch afterward — keeps
 * filtered matches that rank beyond POOL_CAP, which a text-only FTS pool would drop.
 */
async function ftsCandidateIds(match: string, filter: SQL, cap: number): Promise<string[]> {
  const rows = await getDb().all<{ id: string }>(sql`
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
  const row = await getDb().get<{ c: number }>(sql`
    SELECT count(distinct apps.id) AS c
    FROM apps_fts
    JOIN apps ON apps.id = apps_fts.app_id
    JOIN app_snapshots ON app_snapshots.app_id = apps.id
    WHERE apps_fts MATCH ${match} AND ${filter}
  `);
  return row?.c ?? 0;
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
  const ftsMatch = search ? toFtsMatch(search) : null;
  const conds = buildConditions(params, maxDate);
  let totalCount: number;
  let ids: string[];
  if (ftsMatch) {
    const filter = and(...allConditions(conds))!;
    const cap = effectivePoolCap(params);
    [totalCount, ids] = await Promise.all([ftsCount(ftsMatch, filter), ftsCandidateIds(ftsMatch, filter, cap)]);
  } else {
    [totalCount, ids] = await Promise.all([countMatches(conds), selectCandidateIds(conds, params)]);
  }
  return { totalCount, ids, marketCountry };
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

import {
  apps,
  appSnapshots,
  appleSearchAds,
  appsWithAppleAds,
  appsWithCreators,
  countApps,
  creators,
  getAppRowById,
  getSnapshotContext,
  iaps,
  toFtsMatch,
  listHistoricals,
  loadAppRelations,
  metaAds,
  parseJsonArray,
  updateAppListingFacts,
  type App,
  type AppSnapshot,
  type SnapshotContext,
} from "@kittie/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  max,
  ne,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { lookupAppleApp } from "@kittie/ingest";
import {
  type AppSignals,
  computeGrowthPct,
  computeGrowthScore,
  estimateDownloads,
  estimateRevenue,
  GROWTH_PERIOD_DAYS,
  isFirstMover,
  priorEstimates,
  scoreApp,
  signalsFromContext,
} from "@kittie/intelligence";
import type {
  AppDetail,
  AppHistoricalPoint,
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  AppListItem,
  AppSearchParams,
  GrowthPeriod,
  MetaAdCreative,
  PaginatedResponse,
  Review,
  Store,
} from "@kittie/types";
import { getDb } from "../lib/db.js";
import { matchesSearch, paginateApps, sortApps, type ScoredAppRow } from "./filter-sort.js";

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function listItemFromContext(
  ctx: SnapshotContext,
  period: GrowthPeriod,
  rankDelta: number | null,
): AppListItem {
  const reviewGrowth7d =
    ctx.prior != null ? ctx.latest.reviewCount - ctx.prior.reviewCount : null;

  const base = {
    id: ctx.app.id,
    store: ctx.app.store,
    storeAppId: ctx.app.storeAppId,
    title: ctx.app.title,
    iconUrl: ctx.app.iconUrl,
    developer: ctx.app.developer,
    category: ctx.app.category,
    rating: ctx.latest.rating,
    reviewCount: ctx.latest.reviewCount,
    releasedAt: toIso(ctx.app.releasedAt),
    updatedAt: toIso(ctx.app.updatedAt),
  };

  if (ctx.latest.revenueEstimate != null && ctx.latest.growthScore != null) {
    // Growth is always computed live from the in-memory context: stored scores
    // predate snapshot history and would freeze every app at the same value.
    const signals = signalsFromContext(ctx);
    const growthScore = computeGrowthScore(signals, period);
    return {
      ...base,
      reviewGrowth7d,
      downloadsEstimate30d: ctx.latest.downloadsEstimate,
      revenueEstimate30d: ctx.latest.revenueEstimate,
      growthScore,
      growthPct: computeGrowthPct(signals, period),
      ...priorEstimates(signals),
      rankDelta,
      isFirstMover: isFirstMover(signals, growthScore),
    };
  }

  return { ...scoreApp(base, signalsFromContext(ctx)), rankDelta };
}

function filterMetaFromContext(ctx: SnapshotContext): ScoredAppRow["meta"] {
  return {
    hasMetaAds: ctx.metaAdCount > 0,
    hasAppleAds: false,
    hasCreators: false,
    hasEmail: Boolean(ctx.app.supportEmail),
    hasWebsite: Boolean(ctx.app.websiteUrl),
    price: ctx.app.price,
    languages: parseJsonArray(ctx.app.languages).map((l) => l.toLowerCase()),
    description: ctx.app.description,
  };
}

/** Drop in-memory list/sparkline/rank caches so Explore picks up new snapshot days. */
export function invalidateAppReadCaches(): void {
  cachedMaxDate = undefined;
}

// Upper bound on apps materialized + scored per /apps request. Explore, Highlights
// and Rising only ever read the top slice of a sort, so we narrow to the top-N
// candidates in SQL (by the requested metric) and score only those. Scoring all
// ~1.1M apps in memory — what this path used to do — OOMs the heap.
const POOL_CAP = 5000;

// Latest snapshot day across the catalog; apps are listed from their row on this
// day (≈99% of apps have one). Refreshed when snapshots-daily invalidates caches.
let cachedMaxDate: string | null | undefined;
async function latestSnapshotDate(): Promise<string | null> {
  if (cachedMaxDate !== undefined) return cachedMaxDate;
  const [row] = await getDb().select({ d: max(appSnapshots.snapshotDate) }).from(appSnapshots);
  const d = row?.d ?? null;
  cachedMaxDate = d;
  return d;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function dayGap(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000,
  );
}
/** Prior = last snapshot on/before (latest − periodDays); else oldest before latest. */
function pickPrior(sorted: AppSnapshot[], latestDate: string, periodDays: number): AppSnapshot | null {
  const target = daysBefore(latestDate, periodDays);
  let best: AppSnapshot | null = null;
  for (const row of sorted) {
    if (row.snapshotDate <= target) best = row;
    if (row.snapshotDate > target) break;
  }
  if (best) return best;
  const oldest = sorted[0];
  return oldest && oldest.snapshotDate < latestDate ? oldest : null;
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
  /** Predicates on the latest-day snapshot (incl. the date pin) — force the join. */
  snapCols: SQL[];
}

function buildConditions(params: AppSearchParams, maxDate: string): AppConditions {
  const appCols: SQL[] = [];
  const snapCols: SQL[] = [eq(appSnapshots.snapshotDate, maxDate)];

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

  if (params.minRating != null) snapCols.push(gte(sql`coalesce(${appSnapshots.rating}, 0)`, params.minRating));
  if (params.maxRating != null) snapCols.push(lte(sql`coalesce(${appSnapshots.rating}, 0)`, params.maxRating));
  if (params.minReviews != null) snapCols.push(gte(appSnapshots.reviewCount, params.minReviews));
  if (params.maxReviews != null) snapCols.push(lte(appSnapshots.reviewCount, params.maxReviews));
  if (params.minDownloads != null) snapCols.push(gte(sql`coalesce(${appSnapshots.downloadsEstimate}, 0)`, params.minDownloads));
  if (params.maxDownloads != null) snapCols.push(lte(sql`coalesce(${appSnapshots.downloadsEstimate}, 0)`, params.maxDownloads));
  if (params.minRevenue != null) snapCols.push(gte(sql`coalesce(${appSnapshots.revenueEstimate}, 0)`, params.minRevenue));
  if (params.maxRevenue != null) snapCols.push(lte(sql`coalesce(${appSnapshots.revenueEstimate}, 0)`, params.maxRevenue));

  if (params.releasedAfter != null) appCols.push(gte(apps.releasedAt, new Date(params.releasedAfter * 1000)));
  if (params.updatedAfter != null) appCols.push(gte(apps.updatedAt, new Date(params.updatedAfter * 1000)));

  if (params.priceType === "free") appCols.push(or(isNull(apps.price), lte(apps.price, 0))!);
  if (params.priceType === "paid") appCols.push(and(isNotNull(apps.price), gt(apps.price, 0))!);

  if (params.hasEmails === true) appCols.push(and(isNotNull(apps.supportEmail), ne(apps.supportEmail, ""))!);
  if (params.hasWebsite === true) appCols.push(and(isNotNull(apps.websiteUrl), ne(apps.websiteUrl, ""))!);

  // App language — languages is a JSON array of uppercase ISO codes (`["EN","FR"]`).
  // Match if the app supports ANY requested code; quote-wrap so "en" can't match a
  // longer token. Superset of matchesSearch's exact parseJsonArray().includes() pass.
  if (params.languages) {
    const want = params.languages.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean);
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

  return { appCols, snapCols };
}

/** Flattened predicate list for the joined candidate query. */
function allConditions(c: AppConditions): SQL[] {
  return [...c.snapCols, ...c.appCols];
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
    case "reviews": return appSnapshots.reviewCount;
    case "rating": return appSnapshots.rating;
    case "updated": return apps.updatedAt;
    case "released":
    case "newest": return apps.releasedAt;
    default: return null;
  }
}

async function countMatches(c: AppConditions, maxDate: string): Promise<number> {
  const db = getDb();
  // Only snapshot-side filter is the date pin → the count is decided entirely by
  // the apps table. Skip the join entirely (it was the 4s cost on filtered loads).
  if (c.snapCols.length === 1) {
    if (c.appCols.length === 0) {
      // Unfiltered → count the latest-day partition straight off its index.
      const [row] = await db.select({ c: count() }).from(appSnapshots).where(eq(appSnapshots.snapshotDate, maxDate));
      return row?.c ?? 0;
    }
    // apps-column filters only (category/source/developer/price/…) → count off the
    // apps indexes. Ignores the <1% of matches lacking a latest-day snapshot, which
    // is within display tolerance for a "X of Y" total.
    const [row] = await db.select({ c: count() }).from(apps).where(and(...c.appCols));
    return row?.c ?? 0;
  }
  // A snapshot-metric filter (rating/reviews/downloads/revenue range) is present →
  // the join is unavoidable.
  const [row] = await db
    .select({ c: count() })
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
      .limit(POOL_CAP);
    return rows.map((r) => r.id);
  }

  const col = sqlSortColumn(params.sortBy) ?? appSnapshots.reviewCount;
  const dir = (params.sortOrder ?? "desc") === "asc" ? asc : desc;
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
    .limit(POOL_CAP);
  return rows.map((r) => r.id);
}

/**
 * Search candidate pool: an FTS5 MATCH on title/developer INTERSECTED with the SQL
 * filters (category / source / numeric ranges / latest-day pin), most-relevant first.
 * Applying the filters DURING selection — not just in matchesSearch afterward — keeps
 * filtered matches that rank beyond POOL_CAP, which a text-only FTS pool would drop.
 */
async function ftsCandidateIds(match: string, filter: SQL): Promise<string[]> {
  const rows = await getDb().all<{ id: string }>(sql`
    SELECT apps.id AS id
    FROM apps_fts
    JOIN apps ON apps.id = apps_fts.app_id
    JOIN app_snapshots ON app_snapshots.app_id = apps.id
    WHERE apps_fts MATCH ${match} AND ${filter}
    ORDER BY apps_fts.rank, apps.id
    LIMIT ${POOL_CAP}
  `);
  return rows.map((r) => r.id);
}

/** Total apps matching the search text AND the SQL filters — the accurate "X of Y" count. */
async function ftsCount(match: string, filter: SQL): Promise<number> {
  const row = await getDb().get<{ c: number }>(sql`
    SELECT count(*) AS c
    FROM apps_fts
    JOIN apps ON apps.id = apps_fts.app_id
    JOIN app_snapshots ON app_snapshots.app_id = apps.id
    WHERE apps_fts MATCH ${match} AND ${filter}
  `);
  return row?.c ?? 0;
}

/** Build scored rows for a bounded id set — the same assembly the old bulk loader did
 *  for the whole catalog, but scoped to the page's candidate pool. */
async function buildScoredRowsForIds(ids: string[], period: GrowthPeriod): Promise<ScoredAppRow[]> {
  if (!ids.length) return [];
  const db = getDb();
  const periodDays = GROWTH_PERIOD_DAYS[period] ?? 7;

  const appRows: App[] = [];
  const snapRows: AppSnapshot[] = [];
  const iapRows: { appId: string }[] = [];
  const metaRows: { appId: string; firstSeenAt: Date | null }[] = [];
  for (const part of chunk(ids, 400)) {
    const [a, s, i, m] = await Promise.all([
      db.select().from(apps).where(inArray(apps.id, part)),
      db.select().from(appSnapshots).where(inArray(appSnapshots.appId, part)).orderBy(appSnapshots.appId, appSnapshots.snapshotDate),
      db.select({ appId: iaps.appId }).from(iaps).where(inArray(iaps.appId, part)),
      db.select({ appId: metaAds.appId, firstSeenAt: metaAds.firstSeenAt }).from(metaAds).where(inArray(metaAds.appId, part)),
    ]);
    appRows.push(...a);
    snapRows.push(...s);
    iapRows.push(...i);
    metaRows.push(...m);
  }

  const snapsByApp = new Map<string, AppSnapshot[]>();
  for (const snap of snapRows) {
    const list = snapsByApp.get(snap.appId);
    if (list) list.push(snap);
    else snapsByApp.set(snap.appId, [snap]);
  }
  const iapCountByApp = new Map<string, number>();
  for (const { appId } of iapRows) iapCountByApp.set(appId, (iapCountByApp.get(appId) ?? 0) + 1);
  const metaByApp = new Map<string, typeof metaRows>();
  for (const ad of metaRows) {
    const list = metaByApp.get(ad.appId);
    if (list) list.push(ad);
    else metaByApp.set(ad.appId, [ad]);
  }

  // Global per-category app counts for just the categories in the pool (scoring signal).
  const cats = [...new Set(appRows.map((a) => a.category).filter((c): c is string => !!c))];
  const categoryCount = new Map<string, number>();
  for (const part of chunk(cats, 400)) {
    const grouped = await db
      .select({ category: apps.category, c: count() })
      .from(apps)
      .where(inArray(apps.category, part))
      .groupBy(apps.category);
    for (const r of grouped) if (r.category) categoryCount.set(r.category, r.c);
  }

  const [appleAdApps, creatorApps, rankDeltas] = await Promise.all([
    appsWithAppleAds(db),
    appsWithCreators(db),
    getRankDeltasFor(ids),
  ]);

  const rows: ScoredAppRow[] = [];
  for (const app of appRows) {
    const snaps = snapsByApp.get(app.id);
    const latest = snaps?.at(-1);
    if (!latest) continue;
    const prior = pickPrior(snaps!, latest.snapshotDate, periodDays);
    const metaAdsForApp = metaByApp.get(app.id) ?? [];
    const metaAdCountPrior = prior
      ? metaAdsForApp.filter((ad) => ad.firstSeenAt && ad.firstSeenAt <= prior.createdAt).length
      : null;
    const ctx: SnapshotContext = {
      app,
      latest,
      prior,
      priorDays: prior ? dayGap(latest.snapshotDate, prior.snapshotDate) : null,
      iapCount: iapCountByApp.get(app.id) ?? 0,
      metaAdCount: metaAdsForApp.length,
      metaAdCountPrior,
      categoryAppCount: app.category ? (categoryCount.get(app.category) ?? 0) : 0,
    };
    const meta = filterMetaFromContext(ctx);
    meta.hasAppleAds = appleAdApps.has(app.id);
    meta.hasCreators = creatorApps.has(app.id);
    rows.push({ item: listItemFromContext(ctx, period, rankDeltas.get(app.id) ?? null), meta });
  }
  return rows;
}

export async function dbHasApps(): Promise<boolean> {
  return (await countApps(getDb())) > 0;
}

/** Minimal per-entry inputs the revenue/downloads model needs from a chart row. */
export interface ChartEstimateInput {
  id: string;
  reviewCount: number;
  rating: number | null;
  /** The app's position on the chart — a rank *lift* in the revenue model. */
  chartRank: number | null;
  category: string | null;
}

/**
 * Downloads / MRR estimates for a set of chart entries, via the SAME revenue model
 * (`estimateRevenue` / `estimateDownloads`) Explore scores through — so the figures
 * are model-consistent across surfaces. Trending computes them live because the
 * stored snapshot estimate columns are populated on only ~31% of chart rows;
 * proxying or blanking the rest would either lie or leave most of the chart empty.
 *
 * Fast by construction: every signal but the iap/ad counts already rides on the
 * chart entry, and those two come from grouped-count seeks over the (≤100) entry
 * ids — no per-app snapshot history is loaded. Velocity uses the model's built-in
 * fallback (no prior review count), which only nudges a minor multiplier.
 */
export async function estimateChartEntries(
  entries: ChartEstimateInput[],
): Promise<Map<string, { downloads: number; revenue: number }>> {
  const map = new Map<string, { downloads: number; revenue: number }>();
  if (!entries.length) return map;
  const db = getDb();
  const ids = entries.map((e) => e.id);

  const [iapRows, metaRows] = await Promise.all([
    db.select({ appId: iaps.appId, c: count() }).from(iaps).where(inArray(iaps.appId, ids)).groupBy(iaps.appId),
    db.select({ appId: metaAds.appId, c: count() }).from(metaAds).where(inArray(metaAds.appId, ids)).groupBy(metaAds.appId),
  ]);
  const iapCount = new Map(iapRows.map((r) => [r.appId, Number(r.c)]));
  const metaCount = new Map(metaRows.map((r) => [r.appId, Number(r.c)]));

  for (const e of entries) {
    const signals: AppSignals = {
      category: e.category,
      chartRank: e.chartRank,
      reviewCount: e.reviewCount,
      reviewCountPrior: null,
      rating: e.rating,
      iapCount: iapCount.get(e.id) ?? 0,
      metaAdCount: metaCount.get(e.id) ?? 0,
      metaAdCountPrior: null,
      chartRankPrior: null,
      priorDays: null,
      updatedAt: null,
      releasedAt: null,
      categoryAppCount: 0,
    };
    const revenue = estimateRevenue(signals);
    map.set(e.id, { downloads: estimateDownloads(signals, revenue), revenue });
  }
  return map;
}

export interface CategoryFacet {
  name: string;
  /** Stores that have at least one app in this category. */
  stores: Store[];
}

/** Distinct categories with the set of stores each appears in (Explore category filter). */
export async function listCategoryFacetsFromDb(): Promise<CategoryFacet[]> {
  const rows = await getDb().select({ category: apps.category, store: apps.store }).from(apps);
  const map = new Map<string, Set<Store>>();
  for (const r of rows) {
    if (!r.category) continue;
    const set = map.get(r.category) ?? new Set<Store>();
    set.add(r.store as Store);
    map.set(r.category, set);
  }
  return [...map.entries()]
    .map(([name, stores]) => ({ name, stores: [...stores] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Signed chart-rank movement (priorRank − latestRank; positive = climbed) for the
// given apps, from their two most recent *ranked* snapshots. Scoped to the id set
// (the unique (app_id, snapshot_date) index makes WHERE app_id IN (…) a seek) so it
// never scans the whole 3M-row snapshot table. Apps without two ranked snapshots are
// absent → the caller defaults them to null. Powers the Highlights "1D" column.
async function getRankDeltasFor(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const db = getDb();
  for (const part of chunk(ids, 400)) {
    const rows = await db
      .select({ appId: appSnapshots.appId, chartRank: appSnapshots.chartRank })
      .from(appSnapshots)
      .where(inArray(appSnapshots.appId, part))
      .orderBy(appSnapshots.appId, appSnapshots.snapshotDate);

    // Keep the last two non-null chart ranks per app (oldest→newest within app).
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
      if (ranks.length === 2) map.set(appId, ranks[0]! - ranks[1]!); // prior − latest
    }
  }
  return map;
}

// Last ≤7 daily reviewCount values per app (oldest→newest), scoped to the returned
// page's ids — the mini review-count trend rendered per row.
async function getSparklinesFor(ids: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (!ids.length) return map;
  const db = getDb();
  for (const part of chunk(ids, 400)) {
    const rows = await db
      .select({ appId: appSnapshots.appId, reviewCount: appSnapshots.reviewCount })
      .from(appSnapshots)
      .where(inArray(appSnapshots.appId, part))
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

export async function searchAppsFromDb(params: AppSearchParams): Promise<PaginatedResponse<AppListItem>> {
  const period = params.growthPeriod ?? "7d";
  const maxDate = await latestSnapshotDate();
  if (!maxDate) return { data: [], pagination: { nextCursor: null, totalCount: 0 } };

  // Free-text search routes through FTS5 (fast, token-prefix), INTERSECTED with the SQL
  // filters; otherwise the pool comes from the SQL filter/sort. matchesSearch then applies
  // the authoritative substring check + the live-only filters on the scored pool either way.
  const search = params.search?.trim();
  const ftsMatch = search ? toFtsMatch(search) : null;
  const conds = buildConditions(params, maxDate);
  let totalCount: number;
  let ids: string[];
  if (ftsMatch) {
    const filter = and(...allConditions(conds))!;
    [totalCount, ids] = await Promise.all([ftsCount(ftsMatch, filter), ftsCandidateIds(ftsMatch, filter)]);
  } else {
    [totalCount, ids] = await Promise.all([countMatches(conds, maxDate), selectCandidateIds(conds, params)]);
  }

  // Score only the bounded candidate pool, then filter/sort/paginate it exactly as
  // before — matchesSearch finalises the live-growth filters the SQL pool omits.
  const rows = await buildScoredRowsForIds(ids, period);
  const filtered = rows.filter((row) => matchesSearch(row, params));
  const sorted = sortApps(filtered, params);
  const { data, nextCursor } = paginateApps(sorted, params);

  // Attach mini review-count trend per returned row only.
  const sparklines = await getSparklinesFor(data.map((d) => d.id));
  const withSparkline = data.map((item) => ({
    ...item,
    sparkline: sparklines.get(item.id) ?? [],
  }));

  return {
    data: withSparkline,
    pagination: { nextCursor, totalCount },
  };
}

function mapRelations(
  iapRows: Awaited<ReturnType<typeof loadAppRelations>>["iapRows"],
  metaRows: Awaited<ReturnType<typeof loadAppRelations>>["metaRows"],
  creatorRows: Awaited<ReturnType<typeof loadAppRelations>>["creatorRows"],
  adRows: Awaited<ReturnType<typeof loadAppRelations>>["adRows"],
  reviewRows: Awaited<ReturnType<typeof loadAppRelations>>["reviewRows"],
) {
  const iaps: AppIap[] = iapRows.map((r) => ({
    name: r.name,
    price: r.price,
    currency: r.currency,
  }));

  const metaAds: MetaAdCreative[] = metaRows.map((r) => ({
    id: r.id,
    platform: "meta" as const,
    adCopy: r.adCopy,
    imageUrl: r.imageUrl,
    videoUrl: r.videoUrl,
    status: r.status,
    firstSeenAt: toIso(r.firstSeenAt),
    lastSeenAt: toIso(r.lastSeenAt),
  }));

  const creators: CreatorPartnership[] = creatorRows.map((r) => ({
    platform: r.platform,
    handle: r.handle,
    profileUrl: r.profileUrl,
    followerCount: r.followerCount,
  }));

  const appleSearchAds: AppleSearchAd[] = adRows.map((r) => ({
    country: r.country,
    keyword: r.keyword,
    rank: r.rank,
  }));

  const reviewList: Review[] = reviewRows.map((r) => ({
    id: r.id,
    appId: r.appId,
    store: r.store,
    country: r.country,
    rating: r.rating,
    title: r.title,
    body: r.body,
    author: r.author,
    reviewedAt: r.reviewedAt.toISOString(),
    sentiment: r.sentiment ?? null,
    topics: parseJsonArray(r.topics),
    improvementAreas: parseJsonArray(r.improvementAreas),
  }));

  return { iaps, metaAds, creators, appleSearchAds, reviewList };
}

/**
 * Lazy listing-facts backfill: the bulk pipeline never fetches size/min-OS/
 * seller, so the first detail view fills them from one Apple lookup and the
 * row keeps them forever. Apple-only; failures degrade to nulls silently.
 */
async function backfillListingFacts<
  T extends {
    id: string;
    store: string;
    storeAppId: string;
    fileSizeBytes: number | null;
    minOsVersion: string | null;
    sellerName: string | null;
  },
>(db: ReturnType<typeof getDb>, app: T): Promise<T> {
  const attempted = app.fileSizeBytes !== null || app.minOsVersion !== null || app.sellerName !== null;
  if (app.store !== "apple" || attempted) return app;
  try {
    const lookup = await lookupAppleApp(app.storeAppId);
    if (!lookup) return app;
    const facts = {
      fileSizeBytes: lookup.fileSizeBytes,
      minOsVersion: lookup.minOsVersion,
      sellerName: lookup.sellerName,
    };
    await updateAppListingFacts(db, app.id, facts);
    return { ...app, ...facts };
  } catch {
    return app; // listing facts are decoration — never fail the detail view
  }
}

export async function getAppByIdFromDb(id: string): Promise<AppDetail | null> {
  const db = getDb();
  const row = await getAppRowById(db, id);
  if (!row) return null;
  const app = await backfillListingFacts(db, row);

  const ctx = await getSnapshotContext(db, id, "7d");
  if (!ctx) return null;

  const rankDeltas = await getRankDeltasFor([id]);
  const list = listItemFromContext(ctx, "7d", rankDeltas.get(id) ?? null);
  const relations = await loadAppRelations(db, id);
  const mapped = mapRelations(
    relations.iapRows,
    relations.metaRows,
    relations.creatorRows,
    relations.adRows,
    relations.reviewRows,
  );
  const snaps = await listHistoricals(db, id);

  const historicals: AppHistoricalPoint[] = snaps.map((s) => ({
    date: s.snapshotDate,
    reviewCount: s.reviewCount,
    rating: s.rating,
    chartRank: s.chartRank,
    downloadsEstimate: s.downloadsEstimate,
    revenueEstimate: s.revenueEstimate,
  }));

  return {
    ...list,
    description: app.description,
    screenshotUrls: parseJsonArray(app.screenshotUrls),
    websiteUrl: app.websiteUrl,
    supportEmail: app.supportEmail,
    price: app.price,
    contentRating: app.contentRating,
    languages: parseJsonArray(app.languages),
    fileSizeBytes: app.fileSizeBytes,
    minOsVersion: app.minOsVersion,
    sellerName: app.sellerName,
    iaps: mapped.iaps,
    metaAds: mapped.metaAds,
    appleSearchAds: mapped.appleSearchAds,
    creators: mapped.creators,
    historicals,
  };
}

export async function getAppHistoricalsFromDb(id: string): Promise<AppHistoricalPoint[] | null> {
  const db = getDb();
  const app = await getAppRowById(db, id);
  if (!app) return null;

  const snaps = await listHistoricals(db, id);
  return snaps.map((s) => ({
    date: s.snapshotDate,
    reviewCount: s.reviewCount,
    rating: s.rating,
    chartRank: s.chartRank,
    downloadsEstimate: s.downloadsEstimate,
    revenueEstimate: s.revenueEstimate,
  }));
}

export async function getAppReviewsFromDb(id: string): Promise<Review[]> {
  const relations = await loadAppRelations(getDb(), id);
  return mapRelations(
    relations.iapRows,
    relations.metaRows,
    relations.creatorRows,
    relations.adRows,
    relations.reviewRows,
  ).reviewList;
}

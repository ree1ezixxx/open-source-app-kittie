import {
  countApps,
  getAppRowById,
  getSnapshotContext,
  iaps,
  listHistoricals,
  loadAppRelations,
  metaAds,
  parseJsonArray,
  reviewCountPriorForApps,
  updateAppListingFacts,
} from "@kittie/db";
import { inArray, count } from "drizzle-orm";
import { lookupAppleApp } from "@kittie/ingest";
import {
  type AppSignals,
  estimateDownloads,
  estimateRevenue,
  GROWTH_PERIOD_DAYS,
} from "@kittie/intelligence";
import type {
  AppDetail,
  AppHistoricalPoint,
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  AppListItem,
  AppSearchParams,
  MetaAdCreative,
  PaginatedResponse,
  Review,
} from "@kittie/types";
import { getDb } from "../lib/db.js";
import { buildScoredAppRows, listItemFromContext } from "./app-list-scoring.js";
import {
  invalidateAppReadCaches as invalidateAppQueryReadCaches,
  getRankDeltasFor,
  getSparklinesFor,
  listCategoryFacetsFromDb,
  poolIsInFinalOrder,
  searchAppCandidates,
} from "./app-query.js";
import {
  dropsRowsInMemory,
  hasLiveGrowthFilter,
  matchesSearch,
  paginateApps,
  sortApps,
} from "./filter-sort.js";

export type { CategoryFacet } from "./app-query.js";

const APP_SEARCH_CACHE_TTL_MS = 300_000;
const APP_SEARCH_CACHE_MAX = 100;
const appSearchCache = new Map<string, { value: PaginatedResponse<AppListItem>; at: number }>();

export function invalidateAppReadCaches(): void {
  appSearchCache.clear();
  invalidateAppQueryReadCaches();
}

function appSearchCacheKey(params: AppSearchParams): string {
  return JSON.stringify(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function rememberAppSearch(key: string, value: PaginatedResponse<AppListItem>): PaginatedResponse<AppListItem> {
  appSearchCache.set(key, { value, at: Date.now() });
  if (appSearchCache.size > APP_SEARCH_CACHE_MAX) {
    const oldest = appSearchCache.keys().next().value;
    if (oldest) appSearchCache.delete(oldest);
  }
  return value;
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function dbHasApps(): Promise<boolean> {
  return (await countApps(getDb())) > 0;
}

/** Minimal per-entry inputs the revenue/downloads model needs from a chart row. */
export interface ChartEstimateInput {
  id: string;
  reviewCount: number;
  rating: number | null;
  chartRank: number | null;
  category: string | null;
}

export async function estimateChartEntries(
  entries: ChartEstimateInput[],
  country = "US",
): Promise<Map<string, { downloads: number; revenue: number }>> {
  const map = new Map<string, { downloads: number; revenue: number }>();
  if (!entries.length) return map;
  const db = getDb();
  const ids = entries.map((e) => e.id);

  const [iapRows, metaRows, reviewPrior] = await Promise.all([
    db.select({ appId: iaps.appId, c: count() }).from(iaps).where(inArray(iaps.appId, ids)).groupBy(iaps.appId),
    db.select({ appId: metaAds.appId, c: count() }).from(metaAds).where(inArray(metaAds.appId, ids)).groupBy(metaAds.appId),
    reviewCountPriorForApps(db, ids, country, GROWTH_PERIOD_DAYS["7d"] ?? 7),
  ]);
  const iapCount = new Map(iapRows.map((r) => [r.appId, Number(r.c)]));
  const metaCount = new Map(metaRows.map((r) => [r.appId, Number(r.c)]));

  for (const e of entries) {
    const signals: AppSignals = {
      category: e.category,
      chartRank: e.chartRank,
      reviewCount: e.reviewCount,
      reviewCountPrior: reviewPrior.get(e.id) ?? null,
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

export async function searchAppsFromDb(params: AppSearchParams): Promise<PaginatedResponse<AppListItem>> {
  const cacheKey = appSearchCacheKey(params);
  const cached = appSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < APP_SEARCH_CACHE_TTL_MS) return cached.value;

  const period = params.growthPeriod ?? "7d";
  const pool = await searchAppCandidates(params);
  if (!pool) return rememberAppSearch(cacheKey, { data: [], pagination: { nextCursor: null, totalCount: 0 } });

  const { totalCount, ids, marketCountry } = pool;

  // Fast path: when the SQL candidate set already IS the result set in final order
  // (SQL-native DESC sort, no in-memory-dropping filter), the page can be sliced
  // straight off `ids` and only those ~50 rows scored — instead of scoring the whole
  // ~5000-row pool just to slice 50. Same rows, same order; cuts cold p95 ~3-4×.
  if (poolIsInFinalOrder(params) && !dropsRowsInMemory(params)) {
    const limit = params.limit ?? 20;
    let start = 0;
    if (params.cursor) {
      const idx = ids.indexOf(params.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const pageIds = ids.slice(start, start + limit);
    const pageRows = await buildScoredAppRows(pageIds, period, marketCountry, new Map<string, number>());
    const pageData = pageRows.map((r) => r.item);
    const pageNextCursor = start + limit < ids.length ? (pageData.at(-1)?.id ?? null) : null;
    const pageSparklines = await getSparklinesFor(pageData.map((d) => d.id), marketCountry);
    return rememberAppSearch(cacheKey, {
      data: pageData.map((item) => ({ ...item, sparkline: pageSparklines.get(item.id) ?? [] })),
      pagination: { nextCursor: pageNextCursor, totalCount },
    });
  }

  const rankDeltas =
    params.sortBy === "rankDelta"
      ? await getRankDeltasFor(ids, marketCountry)
      : new Map<string, number>();
  const rows = await buildScoredAppRows(ids, period, marketCountry, rankDeltas);
  const filtered = rows.filter((row) => matchesSearch(row, params));
  const sorted = sortApps(filtered, params);
  const { data, nextCursor } = paginateApps(sorted, params);

  const sparklines = await getSparklinesFor(data.map((d) => d.id), marketCountry);
  const withSparkline = data.map((item) => ({
    ...item,
    sparkline: sparklines.get(item.id) ?? [],
  }));

  const reportedTotal = hasLiveGrowthFilter(params) ? filtered.length : totalCount;

  return rememberAppSearch(cacheKey, {
    data: withSparkline,
    pagination: { nextCursor, totalCount: reportedTotal },
  });
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
    return app;
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

export { listCategoryFacetsFromDb };

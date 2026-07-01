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
import { fetchGoogleAppMetadata, lookupAppleApp, upsertApp, upsertMetricSnapshot } from "@kittie/ingest";
import {
  type AppSignals,
  type MarketApp,
  estimateDownloads,
  estimateRevenue,
  GROWTH_PERIOD_DAYS,
  synthesizeOpportunity,
} from "@kittie/intelligence";
import type {
  AppDetail,
  AppHistoricalPoint,
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  AppListItem,
  AppSearchParams,
  DecisionPacket,
  MetaAdCreative,
  PaginatedResponse,
  Review,
  Store,
} from "@kittie/types";
import { getDb } from "../lib/db.js";
import { buildScoredAppRows, listItemFromContext } from "./app-list-scoring.js";
import {
  invalidateAppReadCaches as invalidateAppQueryReadCaches,
  getRankDeltasFor,
  getSparklinesFor,
  keysetColumn,
  listCategoryFacetsFromDb,
  poolIsInFinalOrder,
  searchAppCandidates,
  searchAppCandidatesKeyset,
  searchAppCandidatesKeysetFts,
} from "./app-query.js";
import {
  decodeKeysetCursor,
  dropsRowsInMemory,
  encodeKeysetCursor,
  hasLiveGrowthFilter,
  matchesSearch,
  paginateApps,
  searchKeysetSafe,
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

export function parseStoreAppLookupId(id: string): { store: Store; storeAppId: string } | null {
  const apple = /^apple:(\d+)$/.exec(id);
  if (apple) return { store: "apple", storeAppId: apple[1]! };

  const google = /^google:([a-z][\w]*(?:\.[\w]+)+)$/i.exec(id);
  if (google) return { store: "google", storeAppId: google[1]! };

  return null;
}

export async function ingestStoreAppById(id: string): Promise<string | null> {
  const parsed = parseStoreAppLookupId(id);
  if (!parsed) return null;

  const db = getDb();
  const snapshotDate = new Date().toISOString().slice(0, 10);

  try {
    if (parsed.store === "apple") {
      const app = await lookupAppleApp(parsed.storeAppId);
      if (!app) return null;
      const appId = await upsertApp(db, {
        store: "apple",
        storeAppId: app.storeAppId,
        bundleId: app.bundleId,
        title: app.title,
        developer: app.developer,
        category: app.category,
        iconUrl: app.iconUrl,
        description: app.description,
        websiteUrl: app.websiteUrl,
        price: app.price,
        contentRating: app.contentRating,
        languages: app.languages,
        screenshotUrls: app.screenshotUrls,
        releasedAt: app.releasedAt,
        updatedAt: app.updatedAt,
      });
      await upsertMetricSnapshot(db, {
        appId,
        snapshotDate,
        reviewCount: app.reviewCount,
        rating: app.rating,
        chartCountry: "US",
      });
      invalidateAppReadCaches();
      return appId;
    }

    const app = await fetchGoogleAppMetadata(parsed.storeAppId);
    const appId = await upsertApp(db, {
      store: "google",
      storeAppId: app.storeAppId,
      bundleId: app.bundleId,
      title: app.title,
      developer: app.developer,
      category: app.category,
      iconUrl: app.iconUrl,
      description: app.description,
      websiteUrl: app.websiteUrl,
      price: app.price,
      contentRating: app.contentRating,
      screenshotUrls: app.screenshotUrls,
      releasedAt: app.releasedAt,
      updatedAt: app.updatedAt,
    });
    await upsertMetricSnapshot(db, {
      appId,
      snapshotDate,
      reviewCount: app.reviewCount,
      rating: app.rating,
      chartCountry: "US",
    });
    invalidateAppReadCaches();
    return appId;
  } catch {
    return null;
  }
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

  // Keyset fast-path: a SQL-native DESC sort whose raw column orders byte-identically to
  // the legacy sortApps path (keysetColumn != null), no in-memory-dropping filter, and
  // either no cursor or a keyset (tuple) cursor. Paginate in SQL with a (sortValue, id)
  // boundary + LIMIT pageSize — the candidate scan is ~50 rows, not the 5000-row
  // POOL_CAP. A legacy bare-id cursor decodes to null and falls through to the pool path
  // below, so a mid-session client holding an old cursor keeps working unchanged.
  const keysetCursor = decodeKeysetCursor(params.cursor);
  if (
    keysetColumn(params) !== null &&
    (!dropsRowsInMemory(params) || searchKeysetSafe(params)) &&
    (params.cursor == null || keysetCursor !== null)
  ) {
    const limit = params.limit ?? 20;
    // FTS keyset when the (only) drop-filter is a free-text search; the plain keyset
    // candidate otherwise. Both return a single keyset page ordered by the sort column.
    const kpool = params.search
      ? await searchAppCandidatesKeysetFts(params, keysetCursor, limit)
      : await searchAppCandidatesKeyset(params, keysetCursor, limit);
    if (!kpool) return rememberAppSearch(cacheKey, { data: [], pagination: { nextCursor: null, totalCount: 0 } });
    const rows = await buildScoredAppRows(kpool.ids, period, kpool.marketCountry, new Map<string, number>());
    const data = rows.map((r) => r.item);
    const last = data.at(-1);
    // Full page → there may be more; short page → end. (Keyset removes the legacy
    // POOL_CAP pagination ceiling, so deep pages past ~5000 now continue instead of
    // resetting — a strict improvement over the old behavior.) The cursor's sortValue is
    // the CANDIDATE scan's column value (kpool.sortValues), not the scored item's, so a
    // newer partial-day snapshot can't shift the boundary and re-emit rows.
    const nextCursor =
      data.length === limit && last ? encodeKeysetCursor(kpool.sortValues.get(last.id) ?? null, last.id) : null;
    const sparklines = await getSparklinesFor(data.map((d) => d.id), kpool.marketCountry);
    return rememberAppSearch(cacheKey, {
      data: data.map((item) => ({ ...item, sparkline: sparklines.get(item.id) ?? [] })),
      pagination: { nextCursor, totalCount: kpool.totalCount },
    });
  }

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

/**
 * Synthesise this app's category-opportunity DecisionPacket from OBSERVED peers:
 * the app's category is the niche, its most-reviewed category peers are the
 * competitor sample. Honest by construction — ad data and un-mined review themes
 * are declared in `coverage.missing` (so coverage is never `full`), confidence
 * scales with the real peer sample, and a category-less app yields no packet
 * (we never invent a niche). Never throws: a peer-fetch/synthesis failure returns
 * undefined so the detail fetch is unaffected.
 */
async function buildCategoryOpportunity(
  category: string | null,
  selfId: string,
  snapshotId: string,
  observedAt: string,
): Promise<DecisionPacket | undefined> {
  if (!category) return undefined;
  try {
    const peerRes = await searchAppsFromDb({
      categories: category,
      sortBy: "reviews",
      sortOrder: "desc",
      limit: 50,
    });
    const peers: MarketApp[] = peerRes.data
      .filter((p) => p.id !== selfId)
      .map((p) => ({
        id: p.id,
        store: p.store,
        title: p.title,
        rating: p.rating,
        reviewCount: p.reviewCount,
      }));
    return synthesizeOpportunity({
      niche: category,
      apps: peers,
      reviewThemes: null,
      observedAt,
      snapshotId,
    });
  } catch {
    return undefined;
  }
}

export async function getAppByIdFromDb(id: string): Promise<AppDetail | null> {
  const db = getDb();
  let row = await getAppRowById(db, id);
  if (!row && (await ingestStoreAppById(id))) {
    row = await getAppRowById(db, id);
  }
  if (!row) return null;
  const app = await backfillListingFacts(db, row);

  let ctx = await getSnapshotContext(db, id, "7d");
  if (!ctx && (await ingestStoreAppById(id))) {
    ctx = await getSnapshotContext(db, id, "7d");
  }
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

  const decisionPacket = await buildCategoryOpportunity(
    list.category,
    id,
    ctx.latest.id,
    ctx.latest.createdAt.toISOString(),
  );

  return {
    ...list,
    decisionPacket,
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

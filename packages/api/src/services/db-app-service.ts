import {
  appsWithAppleAds,
  appsWithCreators,
  countApps,
  getAppRowById,
  getSnapshotContext,
  listHistoricals,
  listSnapshotContexts,
  loadAppRelations,
  parseJsonArray,
  type SnapshotContext,
} from "@kittie/db";
import { scoreApp, signalsFromContext } from "@kittie/intelligence";
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
} from "@kittie/types";
import { getDb } from "../lib/db.js";
import { matchesSearch, paginateApps, sortApps, type ScoredAppRow } from "./filter-sort.js";

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function listItemFromContext(ctx: SnapshotContext, period: GrowthPeriod): AppListItem {
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
    return {
      ...base,
      reviewGrowth7d,
      downloadsEstimate30d: ctx.latest.downloadsEstimate,
      revenueEstimate30d: ctx.latest.revenueEstimate,
      growthScore: ctx.latest.growthScore,
      isFirstMover: ctx.latest.isFirstMover ?? false,
    };
  }

  return scoreApp(base, signalsFromContext(ctx));
}

function filterMetaFromContext(ctx: SnapshotContext): ScoredAppRow["meta"] {
  return {
    hasMetaAds: ctx.metaAdCount > 0,
    hasAppleAds: false,
    hasCreators: false,
    hasEmail: Boolean(ctx.app.supportEmail),
    hasWebsite: Boolean(ctx.app.websiteUrl),
    price: ctx.app.price,
  };
}

async function loadScoredRows(period: GrowthPeriod): Promise<ScoredAppRow[]> {
  const db = getDb();
  const [contexts, appleAdApps, creatorApps] = await Promise.all([
    listSnapshotContexts(db, period),
    appsWithAppleAds(db),
    appsWithCreators(db),
  ]);

  return contexts.map((ctx) => {
    const meta = filterMetaFromContext(ctx);
    meta.hasAppleAds = appleAdApps.has(ctx.app.id);
    meta.hasCreators = creatorApps.has(ctx.app.id);
    return {
      item: listItemFromContext(ctx, period),
      meta,
    };
  });
}

// Module-level cache of scored rows, keyed by growth period. Resets on process
// reload (tsx watch). Rebuilds from the DB on the next request after a reseed.
let cachedRows: ScoredAppRow[] | null = null;
let cachePeriod: GrowthPeriod | null = null;

async function getScoredRows(period: GrowthPeriod): Promise<ScoredAppRow[]> {
  if (cachedRows && cachePeriod === period) return cachedRows;
  cachedRows = await loadScoredRows(period);
  cachePeriod = period;
  return cachedRows;
}

export async function dbHasApps(): Promise<boolean> {
  return (await countApps(getDb())) > 0;
}

export async function searchAppsFromDb(params: AppSearchParams): Promise<PaginatedResponse<AppListItem>> {
  const period = params.growthPeriod ?? "7d";
  const rows = await getScoredRows(period);
  const filtered = rows.filter((row) => matchesSearch(row, params));
  const sorted = sortApps(filtered, params);
  const { data, nextCursor, totalCount } = paginateApps(sorted, params);

  return {
    data,
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
  }));

  return { iaps, metaAds, creators, appleSearchAds, reviewList };
}

export async function getAppByIdFromDb(id: string): Promise<AppDetail | null> {
  const db = getDb();
  const app = await getAppRowById(db, id);
  if (!app) return null;

  const ctx = await getSnapshotContext(db, id, "7d");
  if (!ctx) return null;

  const list = listItemFromContext(ctx, "7d");
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

import {
  appsWithAppleAds,
  appsWithCreators,
  countApps,
  getAppRowById,
  getSnapshotContext,
  listHistoricals,
  streamSnapshotContexts,
  loadAppRelations,
  parseJsonArray,
  updateAppListingFacts,
  type SnapshotContext,
} from "@kittie/db";
import { lookupAppleApp } from "@kittie/ingest";
import {
  computeGrowthPct,
  computeGrowthScore,
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
  };
}

async function loadScoredRows(period: GrowthPeriod): Promise<ScoredAppRow[]> {
  const db = getDb();
  const [appleAdApps, creatorApps] = await Promise.all([
    appsWithAppleAds(db),
    appsWithCreators(db),
  ]);

  // Stream contexts in id-ordered chunks and score each chunk into `out`, so only
  // the retained scored rows (plus one in-flight chunk) are ever resident — the
  // build no longer materializes the whole catalog at once. rankDelta + sparkline
  // ride on each context from its single snapshot scan (see streamSnapshotContexts).
  const out: ScoredAppRow[] = [];
  for await (const chunk of streamSnapshotContexts(db, period)) {
    for (const ctx of chunk) {
      const meta = filterMetaFromContext(ctx);
      meta.hasAppleAds = appleAdApps.has(ctx.app.id);
      meta.hasCreators = creatorApps.has(ctx.app.id);
      const item = listItemFromContext(ctx, period, ctx.rankDelta);
      item.sparkline = ctx.sparkline;
      out.push({ item, meta });
    }
  }
  return out;
}

// Module-level cache of scored rows, keyed by growth period. Resets on process
// reload (tsx watch). Rebuilds from the DB on the next request after a reseed.
let cachedRows: ScoredAppRow[] | null = null;
let cachePeriod: GrowthPeriod | null = null;
// Single-flight guard: collapse concurrent cold-cache builds into ONE shared
// promise. Without it, simultaneous requests (Explore + Highlights + Rising, or
// a StrictMode double-mount) each materialize the full ~1.1M-row catalog in
// parallel — N× heap, the Explore OOM. Cleared in finally so a failed build retries.
let inflightRows: Promise<ScoredAppRow[]> | null = null;
let inflightRowsPeriod: GrowthPeriod | null = null;

async function getScoredRows(period: GrowthPeriod): Promise<ScoredAppRow[]> {
  if (cachedRows && cachePeriod === period) return cachedRows;
  if (inflightRows && inflightRowsPeriod === period) return inflightRows;
  inflightRowsPeriod = period;
  inflightRows = loadScoredRows(period)
    .then((rows) => {
      cachedRows = rows;
      cachePeriod = period;
      return rows;
    })
    .finally(() => {
      inflightRows = null;
      inflightRowsPeriod = null;
    });
  return inflightRows;
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

  // sparkline + rankDelta are already on each item, populated from the single
  // app_snapshots scan in listSnapshotContexts — no extra per-request passes.
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

  const list = listItemFromContext(ctx, "7d", ctx.rankDelta);
  list.sparkline = ctx.sparkline;
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

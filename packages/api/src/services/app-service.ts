import { scoreApp } from "@kittie/intelligence";
import type {
  AppDetail,
  AppHistoricalPoint,
  AppListItem,
  AppSearchParams,
  PaginatedResponse,
  Review,
} from "@kittie/types";
import { MOCK_APPS, type RawAppFixture } from "../mock/fixtures.js";

function toListItem(fixture: RawAppFixture): AppListItem {
  return scoreApp(
    {
      id: fixture.id,
      store: fixture.store,
      storeAppId: fixture.storeAppId,
      title: fixture.title,
      iconUrl: fixture.iconUrl,
      developer: fixture.developer,
      category: fixture.category,
      rating: fixture.rating,
      reviewCount: fixture.reviewCount,
      releasedAt: fixture.releasedAt,
      updatedAt: fixture.updatedAt,
    },
    fixture.signals,
  );
}

function toDetail(fixture: RawAppFixture): AppDetail {
  const list = toListItem(fixture);
  return {
    ...list,
    description: fixture.description,
    screenshotUrls: fixture.screenshotUrls,
    websiteUrl: fixture.websiteUrl,
    supportEmail: fixture.supportEmail,
    price: fixture.price,
    contentRating: fixture.contentRating,
    languages: fixture.languages,
    iaps: fixture.iaps,
    metaAds: fixture.metaAds,
    appleSearchAds: fixture.appleSearchAds,
    creators: fixture.creators,
    historicals: fixture.historicals,
  };
}

function matchesSearch(item: AppListItem, params: AppSearchParams): boolean {
  if (params.search) {
    const q = params.search.toLowerCase();
    const hay = `${item.title} ${item.developer}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (params.categories) {
    const cats = params.categories.split(",").map((c) => c.trim().toLowerCase());
    if (!item.category || !cats.includes(item.category.toLowerCase())) return false;
  }

  if (params.excludedCategories && item.category) {
    const excluded = params.excludedCategories.split(",").map((c) => c.trim().toLowerCase());
    if (excluded.includes(item.category.toLowerCase())) return false;
  }

  if (params.source && item.store !== params.source) return false;
  if (params.excludedSource && item.store === params.excludedSource) return false;

  if (params.minDownloads != null && (item.downloadsEstimate30d ?? 0) < params.minDownloads) return false;
  if (params.maxDownloads != null && (item.downloadsEstimate30d ?? 0) > params.maxDownloads) return false;
  if (params.minRevenue != null && (item.revenueEstimate30d ?? 0) < params.minRevenue) return false;
  if (params.maxRevenue != null && (item.revenueEstimate30d ?? 0) > params.maxRevenue) return false;
  if (params.minRating != null && (item.rating ?? 0) < params.minRating) return false;
  if (params.maxRating != null && (item.rating ?? 0) > params.maxRating) return false;
  if (params.minReviews != null && item.reviewCount < params.minReviews) return false;
  if (params.maxReviews != null && item.reviewCount > params.maxReviews) return false;

  if (params.minGrowth != null && (item.growthScore ?? 0) < params.minGrowth) return false;
  if (params.maxGrowth != null && (item.growthScore ?? 0) > params.maxGrowth) return false;

  if (params.growthType === "positive" && (item.growthScore ?? 0) <= 0) return false;
  if (params.growthType === "negative" && (item.growthScore ?? 0) >= 50) return false;

  const fixture = MOCK_APPS.find((a) => a.id === item.id);
  if (!fixture) return false;

  if (params.hasMetaAds === true && fixture.metaAds.length === 0) return false;
  if (params.hasMetaAds === false && fixture.metaAds.length > 0) return false;
  if (params.hasAppleAds === true && fixture.appleSearchAds.length === 0) return false;
  if (params.hasAppleAds === false && fixture.appleSearchAds.length > 0) return false;
  if (params.hasCreators === true && fixture.creators.length === 0) return false;
  if (params.hasCreators === false && fixture.creators.length > 0) return false;
  if (params.hasEmails === true && !fixture.supportEmail) return false;
  if (params.hasWebsite === true && !fixture.websiteUrl) return false;

  if (params.developer) {
    if (!item.developer.toLowerCase().includes(params.developer.toLowerCase())) return false;
  }

  if (params.priceType === "free" && fixture.price != null && fixture.price > 0) return false;
  if (params.priceType === "paid" && (fixture.price == null || fixture.price <= 0)) return false;

  return true;
}

function sortValue(item: AppListItem, sortBy: AppSearchParams["sortBy"]): number | string {
  switch (sortBy) {
    case "growth":
    case "trending":
      return item.growthScore ?? 0;
    case "rating":
      return item.rating ?? 0;
    case "reviews":
      return item.reviewCount;
    case "downloads":
      return item.downloadsEstimate30d ?? 0;
    case "revenue":
      return item.revenueEstimate30d ?? 0;
    case "updated":
      return item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    case "released":
    case "newest":
      return item.releasedAt ? new Date(item.releasedAt).getTime() : 0;
    default:
      return item.growthScore ?? 0;
  }
}

function sortApps(items: AppListItem[], params: AppSearchParams): AppListItem[] {
  const sortBy = params.sortBy ?? "growth";
  const order = params.sortOrder ?? (sortBy === "growth" || sortBy === "trending" ? "desc" : "desc");
  const dir = order === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const av = sortValue(a, sortBy);
    const bv = sortValue(b, sortBy);
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    return ((av as number) - (bv as number)) * dir;
  });
}

export function searchApps(params: AppSearchParams): PaginatedResponse<AppListItem> {
  const limit = params.limit ?? 20;
  const all = sortApps(
    MOCK_APPS.map(toListItem).filter((item) => matchesSearch(item, params)),
    params,
  );

  let start = 0;
  if (params.cursor) {
    const idx = all.findIndex((a) => a.id === params.cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }

  const page = all.slice(start, start + limit);
  const nextCursor = start + limit < all.length ? (page.at(-1)?.id ?? null) : null;

  return {
    data: page,
    pagination: {
      nextCursor,
      totalCount: all.length,
    },
  };
}

export function getAppById(id: string): AppDetail | null {
  const fixture = MOCK_APPS.find((a) => a.id === id);
  return fixture ? toDetail(fixture) : null;
}

export function getAppHistoricals(id: string): AppHistoricalPoint[] | null {
  const fixture = MOCK_APPS.find((a) => a.id === id);
  return fixture ? fixture.historicals : null;
}

export function getAppReviews(id: string): Review[] {
  const fixture = MOCK_APPS.find((a) => a.id === id);
  return fixture?.reviews ?? [];
}

import type { AppListItem, AppSearchParams } from "@kittie/types";

export interface AppFilterMeta {
  hasMetaAds: boolean;
  hasAppleAds: boolean;
  hasCreators: boolean;
  hasEmail: boolean;
  hasWebsite: boolean;
  price: number | null;
  /** Supported ISO language codes, pre-lowercased ("en", "fr", …). */
  languages: string[];
  description: string | null;
}

export interface ScoredAppRow {
  item: AppListItem;
  meta: AppFilterMeta;
}

export function matchesSearch(row: ScoredAppRow, params: AppSearchParams): boolean {
  const item = row.item;

  if (params.search) {
    const q = params.search.toLowerCase();
    const fields = params.textSearchFields
      ? params.textSearchFields.split(",").map((f) => f.trim().toLowerCase()).filter(Boolean)
      : ["title", "developer", "description"];
    const hay: Record<string, string> = {
      title: item.title.toLowerCase(),
      developer: item.developer.toLowerCase(),
      description: (row.meta.description ?? "").toLowerCase(),
    };
    if (!fields.some((field) => hay[field]?.includes(q))) return false;
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

  // Time windows — releasedAfter/updatedAfter are epoch *seconds* (the UI sends days→epoch).
  // releasedAt/updatedAt are ISO strings; compare in seconds. A missing date is excluded.
  if (params.releasedAfter != null) {
    const released = item.releasedAt ? Math.floor(new Date(item.releasedAt).getTime() / 1000) : null;
    if (released == null || released < params.releasedAfter) return false;
  }
  if (params.releasedBefore != null) {
    const released = item.releasedAt ? Math.floor(new Date(item.releasedAt).getTime() / 1000) : null;
    if (released == null || released > params.releasedBefore) return false;
  }
  if (params.updatedAfter != null) {
    const updated = item.updatedAt ? Math.floor(new Date(item.updatedAt).getTime() / 1000) : null;
    if (updated == null || updated < params.updatedAfter) return false;
  }
  if (params.updatedBefore != null) {
    const updated = item.updatedAt ? Math.floor(new Date(item.updatedAt).getTime() / 1000) : null;
    if (updated == null || updated > params.updatedBefore) return false;
  }

  if (params.minGrowth != null && (item.growthScore ?? 0) < params.minGrowth) return false;
  if (params.maxGrowth != null && (item.growthScore ?? 0) > params.maxGrowth) return false;

  if (params.growthType === "positive" && (item.growthScore ?? 0) <= 50) return false;
  if (params.growthType === "negative" && (item.growthScore ?? 0) >= 50) return false;

  if (params.hasMetaAds === true && !row.meta.hasMetaAds) return false;
  if (params.hasMetaAds === false && row.meta.hasMetaAds) return false;
  if (params.hasAppleAds === true && !row.meta.hasAppleAds) return false;
  if (params.hasAppleAds === false && row.meta.hasAppleAds) return false;
  if (params.hasCreators === true && !row.meta.hasCreators) return false;
  if (params.hasCreators === false && row.meta.hasCreators) return false;
  if (params.hasEmails === true && !row.meta.hasEmail) return false;
  if (params.hasWebsite === true && !row.meta.hasWebsite) return false;

  if (params.developer) {
    if (!item.developer.toLowerCase().includes(params.developer.toLowerCase())) return false;
  }

  // App language — comma list of ISO codes; match if the app supports ANY of them.
  // meta.languages is pre-lowercased at row-build time, so compare lowercase.
  if (params.languages) {
    const want = params.languages
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (want.length && !want.some((l) => row.meta.languages.includes(l))) return false;
  }

  if (params.priceType === "free" && row.meta.price != null && row.meta.price > 0) return false;
  if (params.priceType === "paid" && (row.meta.price == null || row.meta.price <= 0)) return false;

  return true;
}

/** Growth score filters run in-memory only — SQL total must not include them. */
export function hasLiveGrowthFilter(params: AppSearchParams): boolean {
  return (
    params.growthType === "positive" ||
    params.growthType === "negative" ||
    params.minGrowth != null ||
    params.maxGrowth != null
  );
}

function sortValue(item: AppListItem, sortBy: AppSearchParams["sortBy"]): number | string | null {
  switch (sortBy) {
    case "growth":
    case "trending":
      return item.growthScore ?? 0;
    case "rating":
      return item.rating ?? 0;
    case "reviews":
      return item.reviewCount;
    case "downloads":
      return item.downloadsEstimate30d;
    case "revenue":
      return item.revenueEstimate30d;
    case "updated":
      return item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    case "released":
    case "newest":
      return item.releasedAt ? new Date(item.releasedAt).getTime() : 0;
    case "rankDelta":
      // Null (no two ranked snapshots) sinks below every real delta — see sortApps.
      return item.rankDelta;
    default:
      return item.growthScore ?? 0;
  }
}

export function sortApps(rows: ScoredAppRow[], params: AppSearchParams): AppListItem[] {
  const sortBy = params.sortBy ?? "growth";
  const order = params.sortOrder ?? "desc";
  const dir = order === "asc" ? 1 : -1;

  return [...rows]
    .sort((a, b) => {
      const av = sortValue(a.item, sortBy);
      const bv = sortValue(b.item, sortBy);
      // Nulls always sink to the bottom, regardless of sort direction, so the
      // gainers (desc) and losers (asc) widgets never surface unranked apps.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    })
    .map((r) => r.item);
}

export function paginateApps(
  items: AppListItem[],
  params: AppSearchParams,
): { data: AppListItem[]; nextCursor: string | null; totalCount: number } {
  const limit = params.limit ?? 20;
  let start = 0;

  if (params.cursor) {
    const idx = items.findIndex((a) => a.id === params.cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }

  const page = items.slice(start, start + limit);
  const nextCursor = start + limit < items.length ? (page.at(-1)?.id ?? null) : null;

  return { data: page, nextCursor, totalCount: items.length };
}

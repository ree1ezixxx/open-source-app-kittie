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
import {
  dbHasApps,
  getAppByIdFromDb,
  getAppHistoricalsFromDb,
  getAppReviewsFromDb,
  listCategoryFacetsFromDb,
  parseStoreAppLookupId,
  resolveStoreAppIdFromDb,
  searchAppsFromDb,
  type CategoryFacet,
} from "./db-app-service.js";
import { matchesSearch, paginateApps, sortApps, type ScoredAppRow } from "./filter-sort.js";

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
    fileSizeBytes: null,
    minOsVersion: null,
    sellerName: null,
    iaps: fixture.iaps,
    metaAds: fixture.metaAds,
    appleSearchAds: fixture.appleSearchAds,
    creators: fixture.creators,
    historicals: fixture.historicals,
  };
}

function mockRows(): ScoredAppRow[] {
  return MOCK_APPS.map((fixture) => ({
    item: toListItem(fixture),
    meta: {
      hasMetaAds: fixture.metaAds.length > 0,
      hasAppleAds: fixture.appleSearchAds.length > 0,
      hasCreators: fixture.creators.length > 0,
      hasEmail: Boolean(fixture.supportEmail),
      hasWebsite: Boolean(fixture.websiteUrl),
      price: fixture.price,
      languages: fixture.languages.map((l) => l.toLowerCase()),
      description: fixture.description,
    },
  }));
}

function searchAppsMock(params: AppSearchParams): PaginatedResponse<AppListItem> {
  const filtered = mockRows().filter((row) => matchesSearch(row, params));
  const sorted = sortApps(filtered, params);
  const { data, nextCursor, totalCount } = paginateApps(sorted, params);
  // Mirror the DB path: attach last ≤7 daily reviewCount values per returned row.
  const byId = new Map(MOCK_APPS.map((f) => [f.id, f]));
  const withSparkline = data.map((item) => ({
    ...item,
    sparkline: (byId.get(item.id)?.historicals ?? [])
      .slice(-7)
      .map((h) => h.reviewCount ?? 0),
  }));
  return { data: withSparkline, pagination: { nextCursor, totalCount } };
}

export async function searchApps(params: AppSearchParams): Promise<PaginatedResponse<AppListItem>> {
  if (await dbHasApps()) return searchAppsFromDb(params);
  return searchAppsMock(params);
}

export async function getAppById(id: string): Promise<AppDetail | null> {
  if (await dbHasApps()) return getAppByIdFromDb(id);
  const fixture = MOCK_APPS.find((a) => a.id === id);
  return fixture ? toDetail(fixture) : null;
}

export async function getAppByAnyId(id: string): Promise<AppDetail | null> {
  const direct = await getAppById(id);
  if (direct) return direct;

  const parsed = parseStoreAppLookupId(id);
  if (!parsed) return null;

  if (await dbHasApps()) {
    const appId = await resolveStoreAppIdFromDb(parsed.store, parsed.storeAppId);
    return appId ? getAppByIdFromDb(appId) : null;
  }

  const fixture = MOCK_APPS.find((a) => a.store === parsed.store && a.storeAppId === parsed.storeAppId);
  return fixture ? toDetail(fixture) : null;
}

export async function getAppHistoricals(id: string): Promise<AppHistoricalPoint[] | null> {
  if (await dbHasApps()) return getAppHistoricalsFromDb(id);
  const fixture = MOCK_APPS.find((a) => a.id === id);
  return fixture ? fixture.historicals : null;
}

export async function getAppReviews(id: string): Promise<Review[]> {
  if (await dbHasApps()) return getAppReviewsFromDb(id);
  const fixture = MOCK_APPS.find((a) => a.id === id);
  return fixture?.reviews ?? [];
}

export async function listCategories(): Promise<CategoryFacet[]> {
  if (await dbHasApps()) return listCategoryFacetsFromDb();
  const map = new Map<string, Set<string>>();
  for (const f of MOCK_APPS) {
    if (!f.category) continue;
    const set = map.get(f.category) ?? new Set<string>();
    set.add(f.store);
    map.set(f.category, set);
  }
  return [...map.entries()]
    .map(([name, stores]) => ({ name, stores: [...stores] as CategoryFacet["stores"] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

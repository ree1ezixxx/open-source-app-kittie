import type {
  AppDetail,
  AppHistoricalPoint,
  AppListItem,
  AppSearchParams,
  ChartType,
  PaginatedResponse,
  Review,
  Store,
  TopChartsResult,
} from "@kittie/types";
import { createQueryCache } from "./queryCache";

const BASE = "/api/v1";
const categoriesCache = createQueryCache<CategoryFacet[]>(30 * 60_000, 1);
const chartsCache = createQueryCache<TopChartsResult>(5 * 60_000);

/**
 * List row plus Explore-only extras the list endpoint attaches:
 * `sparkline` = last ≤7 daily reviewCount values (oldest→newest).
 * Optional so rows from older callers / fixtures still typecheck.
 */
export type AppListItemEx = AppListItem & { sparkline?: number[] };

function toQuery(params: AppSearchParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function listApps(
  params: AppSearchParams,
  signal?: AbortSignal,
): Promise<PaginatedResponse<AppListItem>> {
  const res = await fetch(`${BASE}/apps${toQuery(params)}`, { signal });
  if (!res.ok) throw new Error(`Failed to load apps (${res.status})`);
  return (await res.json()) as PaginatedResponse<AppListItem>;
}

/** Category + which stores it appears in — powers the Explore category popover. */
export type CategoryFacet = { name: string; stores: Store[] };

export function peekCategories(): CategoryFacet[] | undefined {
  return categoriesCache.get("all");
}

export async function listCategories(signal?: AbortSignal): Promise<CategoryFacet[]> {
  const cached = categoriesCache.get("all");
  if (cached) return cached;
  const res = await fetch(`${BASE}/apps/categories`, { signal });
  if (!res.ok) throw new Error(`Failed to load categories (${res.status})`);
  const body = (await res.json()) as { data: CategoryFacet[] };
  categoriesCache.set("all", body.data);
  return body.data;
}

export async function getApp(id: string, signal?: AbortSignal): Promise<AppDetail> {
  const res = await fetch(`${BASE}/apps/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(`Failed to load app (${res.status})`);
  const body = (await res.json()) as { data: AppDetail };
  return body.data;
}

/** Real per-day snapshot history (reviewCount/rating/etc.) — backs the Review Growth chart. */
export async function getAppHistoricals(id: string, signal?: AbortSignal): Promise<AppHistoricalPoint[]> {
  const res = await fetch(`${BASE}/apps/${encodeURIComponent(id)}/historicals`, { signal });
  if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
  const body = (await res.json()) as { data: AppHistoricalPoint[] };
  return body.data;
}

/** Trending "Store Rankings" — real top charts with day-over-day rank deltas. */
export function peekCharts(
  params: { store: Store; type: ChartType; country?: string; category?: string; limit?: number },
): TopChartsResult | undefined {
  return chartsCache.get(JSON.stringify(params));
}

export async function listCharts(
  params: { store: Store; type: ChartType; country?: string; category?: string; limit?: number },
  signal?: AbortSignal,
): Promise<TopChartsResult> {
  const key = JSON.stringify(params);
  const cached = chartsCache.get(key);
  if (cached) return cached;
  const q = new URLSearchParams();
  q.set("store", params.store);
  q.set("type", params.type);
  if (params.country) q.set("country", params.country);
  if (params.category) q.set("category", params.category);
  if (params.limit) q.set("limit", String(params.limit));
  const res = await fetch(`${BASE}/charts?${q.toString()}`, { signal });
  if (!res.ok) throw new Error(`Failed to load charts (${res.status})`);
  const body = (await res.json()) as { data: TopChartsResult };
  chartsCache.set(key, body.data);
  return body.data;
}

// Reviews live behind a POST (appId in the body). We pass limit explicitly so the
// 50-cap holds regardless of the server's default.
export async function getReviews(
  id: string,
  signal?: AbortSignal,
  limit = 50,
): Promise<Review[]> {
  const res = await fetch(`${BASE}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: id, limit }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
  const body = (await res.json()) as { data: Review[] };
  return body.data;
}

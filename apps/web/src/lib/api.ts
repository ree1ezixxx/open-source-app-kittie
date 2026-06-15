import type {
  AppDetail,
  AppListItem,
  AppSearchParams,
  ChartType,
  PaginatedResponse,
  Review,
  Store,
  TopChartsResult,
} from "@kittie/types";

const BASE = "/api/v1";

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

export async function getApp(id: string, signal?: AbortSignal): Promise<AppDetail> {
  const res = await fetch(`${BASE}/apps/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(`Failed to load app (${res.status})`);
  const body = (await res.json()) as { data: AppDetail };
  return body.data;
}

/** Trending "Store Rankings" — real top charts with day-over-day rank deltas. */
export async function listCharts(
  params: { store: Store; type: ChartType; country?: string; category?: string; limit?: number },
  signal?: AbortSignal,
): Promise<TopChartsResult> {
  const q = new URLSearchParams();
  q.set("store", params.store);
  q.set("type", params.type);
  if (params.country) q.set("country", params.country);
  if (params.category) q.set("category", params.category);
  if (params.limit) q.set("limit", String(params.limit));
  const res = await fetch(`${BASE}/charts?${q.toString()}`, { signal });
  if (!res.ok) throw new Error(`Failed to load charts (${res.status})`);
  const body = (await res.json()) as { data: TopChartsResult };
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

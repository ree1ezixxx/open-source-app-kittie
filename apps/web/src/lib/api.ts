import type {
  AppDetail,
  AppListItem,
  AppSearchParams,
  PaginatedResponse,
  Review,
} from "@kittie/types";

const BASE = "/api/v1";

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

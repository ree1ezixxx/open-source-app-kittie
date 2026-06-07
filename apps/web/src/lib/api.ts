import type {
  AppDetail,
  AppListItem,
  AppSearchParams,
  PaginatedResponse,
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

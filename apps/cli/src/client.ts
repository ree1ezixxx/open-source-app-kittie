import type { AppDetail, AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";

const API_BASE = process.env.KITTIE_API_URL ?? "http://localhost:3000";

function toQuery(params: AppSearchParams): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  const qs = new URLSearchParams();
  for (const [k, v] of entries) qs.set(k, String(v));
  return qs.toString();
}

export async function searchApps(params: AppSearchParams = {}): Promise<PaginatedResponse<AppListItem>> {
  const res = await fetch(`${API_BASE}/api/v1/apps?${toQuery(params)}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaginatedResponse<AppListItem>>;
}

export async function getAppDetail(id: string): Promise<AppDetail> {
  const res = await fetch(`${API_BASE}/api/v1/apps/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data: AppDetail };
  return body.data;
}

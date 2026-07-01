import type { AppDetail, AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";
import { resolveConfig, type ResolvedConfig } from "./config.js";

function toQuery(params: AppSearchParams): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  const qs = new URLSearchParams();
  for (const [k, v] of entries) qs.set(k, String(v));
  return qs.toString();
}

function headers(config: ResolvedConfig): Record<string, string> {
  return config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {};
}

export async function getHealth(config = resolveConfig()): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${config.apiOrigin}/health`, {
    headers: headers(config),
    signal: AbortSignal.timeout(5_000),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { ok: res.ok, status: res.status, body };
}

export async function searchApps(
  params: AppSearchParams = {},
  config = resolveConfig(),
): Promise<PaginatedResponse<AppListItem>> {
  const res = await fetch(`${config.apiOrigin}/api/v1/apps?${toQuery(params)}`, { headers: headers(config) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaginatedResponse<AppListItem>>;
}

export async function getAppDetail(id: string, config = resolveConfig()): Promise<AppDetail> {
  const res = await fetch(`${config.apiOrigin}/api/v1/apps/${encodeURIComponent(id)}`, { headers: headers(config) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data: AppDetail };
  return body.data;
}

export interface CloneFile {
  path: string;
  contents: string;
}
export interface CloneResponse {
  appId: string;
  sourceTitle: string;
  projectName: string;
  blueprint: {
    appName: string;
    tagline: string;
    accentHex: string;
    primaryEntity: string;
    tabs: Array<{ title: string; kind: string }>;
  };
  files: CloneFile[];
  buildCommands: string[];
  aiGenerated: boolean;
  cached: boolean;
}

export async function cloneIos(appId: string, config = resolveConfig()): Promise<CloneResponse> {
  const res = await fetch(`${config.apiOrigin}/api/v1/clone/ios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers(config) },
    body: JSON.stringify({ appId }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data: CloneResponse };
  return body.data;
}

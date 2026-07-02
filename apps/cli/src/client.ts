import type { AppDetail, AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";
import { loadConfig } from "./config.js";

// Single source of truth: the data commands resolve the API origin through the
// same config precedence (CLI > env > ~/.kittie/config.json > default) that
// `doctor`/`config` use, so they can never disagree about which API to hit.
const API_BASE = loadConfig().apiBaseUrl;

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

/** Generate an iOS clone scaffold of a trending app via the engine endpoint. */
export async function cloneIos(appId: string): Promise<CloneResponse> {
  const res = await fetch(`${API_BASE}/api/v1/clone/ios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data: CloneResponse };
  return body.data;
}

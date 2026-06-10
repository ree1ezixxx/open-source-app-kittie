/* ============================================================
   Additive lane — Compare API client (isolated; do NOT fold into
   lib/api.ts — same lane-isolation rule as reviews.ts).

   Two endpoints, both REAL:
   • GET /api/v1/intel/compare?ids=a,b,c  (2–5 ids) — listing fields,
     latest snapshot metrics, full snapshot history per app. Shapes
     mirror packages/api/src/services/compare-service.ts; the Date
     fields there serialize to ISO strings over JSON, so they are
     strings here.
   • GET /api/v1/apps?search=…            — powers the app picker.
   ============================================================ */
import type { AppListItem, PaginatedResponse } from "@kittie/types";

const BASE = "/api/v1";

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

/** One daily Snapshot row. Estimates (downloads/revenue) are modelled,
    not observed — the UI must label them "est.". */
export interface CompareHistoryPoint {
  date: string; // YYYY-MM-DD
  reviewCount: number;
  rating: number | null;
  chartRank: number | null;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
  growthScore: number | null;
}

export interface CompareLatest {
  snapshotDate: string;
  reviewCount: number;
  rating: number | null;
  chartRank: number | null;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
  growthScore: number | null;
}

export interface CompareApp {
  id: string;
  store: string;
  storeAppId: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  price: number | null;
  contentRating: string | null;
  releasedAt: string | null; // ISO datetime (Date server-side)
  updatedAt: string | null;
  screenshotCount: number;
  latest: CompareLatest | null; // null until the first snapshot lands
  history: CompareHistoryPoint[]; // oldest → newest, only days deep
}

/** Side-by-side data for 2–5 app ids, in request order. Unknown ids are
    silently dropped by the server — callers should diff against what
    they asked for and say so honestly. */
export async function fetchCompare(ids: string[], signal?: AbortSignal): Promise<CompareApp[]> {
  const res = await fetch(`${BASE}/intel/compare?ids=${encodeURIComponent(ids.join(","))}`, {
    signal,
  });
  if (!res.ok) {
    let message = `Failed to load comparison (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }
  const json = (await res.json()) as { data: CompareApp[] };
  return json.data;
}

/* ----------------------------------------------------------------
   Picker search — thin wrapper over the existing apps list endpoint.
   ---------------------------------------------------------------- */
export interface PickerApp {
  id: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  store: string;
}

export async function searchPickerApps(query: string, signal?: AbortSignal): Promise<PickerApp[]> {
  const q = new URLSearchParams({
    search: query,
    limit: "8",
    sortBy: "reviews",
    sortOrder: "desc",
  });
  const res = await fetch(`${BASE}/apps?${q.toString()}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as PaginatedResponse<AppListItem>;
  return json.data.map((a) => ({
    id: a.id,
    title: a.title,
    developer: a.developer,
    category: a.category,
    iconUrl: a.iconUrl,
    store: a.store,
  }));
}

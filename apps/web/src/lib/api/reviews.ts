/* ============================================================
   Lane D — Reviews API client (isolated; do NOT fold into lib/api.ts)

   Two surfaces with very different honesty levels:
   • REAL   — POST /api/v1/reviews returns live review *text* (13,320 rows).
   • MOCK   — sentiment / semantics / improvements are NOT built on the
              backend yet. They live behind this typed interface so the UI
              can render the real shape today and swap to a live source the
              moment one exists. Every mock surface carries `mock: true`
              so the UI can label it honestly — never imply it's computed.
   ============================================================ */
import type { Review, Store } from "@kittie/types";

const BASE = "/api/v1";

/* ----------------------------------------------------------------
   REAL — review text
   ---------------------------------------------------------------- */
export interface ReviewsResponse {
  data: Review[];
  meta: { source: string; stale: boolean };
}

/** Indexed review counts (what we actually hold) per app id. The rail shows
    these instead of the store's inflated listing total. */
export async function fetchReviewCounts(
  ids: string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const res = await fetch(`${BASE}/reviews/counts?ids=${encodeURIComponent(ids.join(","))}`, { signal });
  if (!res.ok) throw new Error(`Failed to load review counts (${res.status})`);
  const json = (await res.json()) as { data: Record<string, number> };
  return json.data;
}

export async function fetchReviews(
  appId: string,
  opts: { country?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ReviewsResponse> {
  const res = await fetch(`${BASE}/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appId,
      country: opts.country ?? "US",
      limit: opts.limit ?? 100,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
  return (await res.json()) as ReviewsResponse;
}

/* ----------------------------------------------------------------
   REAL — on-demand live review pull (Refresh button + add-to-monitoring).
   Hits POST /api/v1/apps/:id/sync-reviews, which fetches the latest written
   reviews from the store and upserts them. Google is live; Apple pending.
   ---------------------------------------------------------------- */
export interface ReviewSyncResult {
  synced: number;
  store: "apple" | "google";
  supported: boolean;
}

export async function syncReviews(appId: string, signal?: AbortSignal): Promise<ReviewSyncResult> {
  const res = await fetch(`${BASE}/apps/${encodeURIComponent(appId)}/sync-reviews`, {
    method: "POST",
    signal,
  });
  if (!res.ok) throw new Error(`Failed to sync reviews (${res.status})`);
  const json = (await res.json()) as { data: ReviewSyncResult };
  return json.data;
}

/* ----------------------------------------------------------------
   REAL — streaming sync for the 5-stage add-to-monitoring modal.
   Consumes GET /apps/:id/sync-reviews/stream (SSE). Each event maps to a
   real backend milestone (start → fetch* → analyse → save → done), so the
   progress bar tracks actual work — no faked timers. Returns a cancel fn.
   ---------------------------------------------------------------- */
export interface SyncStreamHandlers {
  onFetch?: (fetched: number) => void;
  onAnalyse?: (total: number) => void;
  onSave?: (inserted: number) => void;
  onDone?: (result: ReviewSyncResult) => void;
  onError?: (message: string) => void;
}

export function streamSyncReviews(appId: string, h: SyncStreamHandlers): () => void {
  const es = new EventSource(`${BASE}/apps/${encodeURIComponent(appId)}/sync-reviews/stream`);
  let finished = false;
  const close = () => { finished = true; es.close(); };
  const num = (e: Event, key: string): number => {
    try { return JSON.parse((e as MessageEvent).data)[key] as number; } catch { return 0; }
  };

  es.addEventListener("fetch", (e) => h.onFetch?.(num(e, "fetched")));
  es.addEventListener("analyse", (e) => h.onAnalyse?.(num(e, "total")));
  es.addEventListener("save", (e) => h.onSave?.(num(e, "inserted")));
  es.addEventListener("done", (e) => {
    try { h.onDone?.(JSON.parse((e as MessageEvent).data) as ReviewSyncResult); }
    catch { h.onDone?.({ synced: 0, store: "google", supported: true }); }
    close();
  });
  // Server-side failure (named 'failed' to avoid EventSource's reserved 'error').
  es.addEventListener("failed", (e) => {
    let msg = "Sync failed";
    try { msg = JSON.parse((e as MessageEvent).data).message ?? msg; } catch { /* keep default */ }
    h.onError?.(msg);
    close();
  });
  // Native connection error (drop / refused).
  es.onerror = () => { if (!finished) { h.onError?.("Connection lost — is the API running?"); close(); } };

  return close;
}

/* Rating distribution derived from REAL review rows — not mocked. */
export function ratingDistribution(reviews: Review[]): Record<1 | 2 | 3 | 4 | 5, number> {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const k = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    dist[k]++;
  }
  return dist;
}

export function averageRating(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
}

/* ----------------------------------------------------------------
   Monitored-apps store — localStorage (no user/auth backend; G-gap).
   Lane R-owned key; favorites/tracking lanes use their own namespaces.
   ---------------------------------------------------------------- */
export interface MonitoredApp {
  id: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  store: Store;
  reviewCount: number;
  rating: number | null;
}

const STORE_KEY = "kittie.reviews.monitored.v1";

export function getMonitored(): MonitoredApp[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MonitoredApp[]) : [];
  } catch {
    return [];
  }
}

export function setMonitored(apps: MonitoredApp[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(apps));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function addMonitored(app: MonitoredApp): MonitoredApp[] {
  const cur = getMonitored();
  if (cur.some((a) => a.id === app.id)) return cur;
  const next = [...cur, app];
  setMonitored(next);
  return next;
}

export function removeMonitored(id: string): MonitoredApp[] {
  const next = getMonitored().filter((a) => a.id !== id);
  setMonitored(next);
  return next;
}

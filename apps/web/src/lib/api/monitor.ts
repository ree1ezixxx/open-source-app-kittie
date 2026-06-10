/* ============================================================
   Additive lane — Monitor API client (isolated; do NOT fold into lib/api.ts)

   Everything here is REAL: the routes in packages/api/src/routes/monitor.ts
   are live and SQLite-backed. Tracked apps anchor server-side change
   capture; Alerts are derived from recorded changes by the evaluator.
   Date fields arrive as ISO strings over JSON — typed as `string` here.

   The track-picker reuses `listApps` from ../api (GET /apps?search=…);
   no separate search client lives here.
   ============================================================ */
import { formatCompact, formatMoney } from "../format";

const BASE = "/api/v1";

/* ----------------------------------------------------- Tracked apps */

export interface TrackedAppEntry {
  /** tracked_apps row id */
  id: string;
  appId: string;
  note: string | null;
  trackedAt: string;
  lastCapturedAt: string | null;
  app: {
    title: string;
    developer: string;
    iconUrl: string | null;
    category: string | null;
    price: number | null;
    store: string;
    storeAppId: string;
  };
}

export async function fetchTrackedApps(signal?: AbortSignal): Promise<TrackedAppEntry[]> {
  const res = await fetch(`${BASE}/monitor/tracked-apps`, { signal });
  if (!res.ok) throw new Error(`Failed to load tracked apps (${res.status})`);
  const json = (await res.json()) as { data: TrackedAppEntry[] };
  return json.data;
}

export async function trackApp(appId: string, note?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/monitor/tracked-apps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId, note: note ?? null }),
  });
  if (!res.ok) throw new Error(`Failed to track app (${res.status})`);
}

export async function untrackApp(appId: string): Promise<void> {
  const res = await fetch(`${BASE}/monitor/tracked-apps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to untrack app (${res.status})`);
}

export async function updateTrackedNote(appId: string, note: string | null): Promise<void> {
  const res = await fetch(`${BASE}/monitor/tracked-apps/${encodeURIComponent(appId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(`Failed to save note (${res.status})`);
}

/* ----------------------------------------------------------- Changes */

export interface AppChangeEntry {
  id: string;
  appId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  /** When the old value was captured — the diff pair's left edge. */
  priorAt: string;
  capturedAt: string;
}

/** Cross-app feed row — adds listing context for rendering outside a row. */
export interface RecentChangeEntry extends AppChangeEntry {
  appTitle: string;
  appIconUrl: string | null;
}

export async function fetchAppChanges(
  appId: string,
  limit = 200,
  signal?: AbortSignal,
): Promise<AppChangeEntry[]> {
  const res = await fetch(
    `${BASE}/monitor/tracked-apps/${encodeURIComponent(appId)}/changes?limit=${limit}`,
    { signal },
  );
  if (!res.ok) throw new Error(`Failed to load changes (${res.status})`);
  const json = (await res.json()) as { data: AppChangeEntry[] };
  return json.data;
}

export async function fetchRecentChanges(limit = 100, signal?: AbortSignal): Promise<RecentChangeEntry[]> {
  const res = await fetch(`${BASE}/monitor/changes?limit=${limit}`, { signal });
  if (!res.ok) throw new Error(`Failed to load recent changes (${res.status})`);
  const json = (await res.json()) as { data: RecentChangeEntry[] };
  return json.data;
}

/* ------------------------------------------------------------ Alerts */

export interface AlertFeedEntry {
  id: string;
  appId: string;
  appTitle: string;
  appIconUrl: string | null;
  rule: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  capturedAt: string;
  readAt: string | null;
}

export async function fetchAlerts(
  opts: { unreadOnly?: boolean; limit?: number } = {},
  signal?: AbortSignal,
): Promise<AlertFeedEntry[]> {
  const q = new URLSearchParams();
  if (opts.unreadOnly) q.set("unread", "1");
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const res = await fetch(`${BASE}/monitor/alerts${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error(`Failed to load alerts (${res.status})`);
  const json = (await res.json()) as { data: AlertFeedEntry[] };
  return json.data;
}

export async function fetchUnreadAlertCount(signal?: AbortSignal): Promise<number> {
  const res = await fetch(`${BASE}/monitor/alerts/unread-count`, { signal });
  if (!res.ok) throw new Error(`Failed to load unread count (${res.status})`);
  const json = (await res.json()) as { data: { count: number } };
  return json.data.count;
}

/** Mark specific alerts read; omit `ids` to mark every unread alert. */
export async function markAlertsRead(ids?: string[]): Promise<void> {
  const res = await fetch(`${BASE}/monitor/alerts/read`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
  });
  if (!res.ok) throw new Error(`Failed to mark alerts read (${res.status})`);
}

/* ------------------------------------------------------------- Rules */

export type AlertChannel = "feed" | "banner";

export interface AlertRuleEntry {
  id: string;
  rule: string;
  /** Minimum magnitude to fire (units per rule: ranks, stars, percent). */
  threshold: number | null;
  enabled: boolean;
  channels: string[];
}

export async function fetchAlertRules(signal?: AbortSignal): Promise<AlertRuleEntry[]> {
  const res = await fetch(`${BASE}/monitor/alerts/rules`, { signal });
  if (!res.ok) throw new Error(`Failed to load alert rules (${res.status})`);
  const json = (await res.json()) as { data: AlertRuleEntry[] };
  return json.data;
}

export async function updateAlertRule(
  id: string,
  patch: { threshold?: number | null; enabled?: boolean; channels?: AlertChannel[] },
): Promise<void> {
  const res = await fetch(`${BASE}/monitor/alerts/rules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update rule (${res.status})`);
}

/* ------------------------------------------------------------- Sweep */

export interface SweepResult {
  scanned: number;
  captured: number;
  changes: number;
  alerts: number;
}

/** Manual capture pass over every tracked app. Slow-ish: live store fetches. */
export async function runSweep(): Promise<SweepResult> {
  const res = await fetch(`${BASE}/monitor/sweep`, { method: "POST" });
  if (!res.ok) throw new Error(`Capture sweep failed (${res.status})`);
  const json = (await res.json()) as { data: SweepResult };
  return json.data;
}

/* ----------------------------------------------------------------
   Presentation helpers — shared by TrackedAppsPage + AlertsPage.
   `app_changes.field` is snake_case storage naming; humanize it here
   so both surfaces render identical labels and value formats.
   ---------------------------------------------------------------- */

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  price: "Price",
  category: "Category",
  content_rating: "Content rating",
  screenshot_urls: "Screenshots",
  rating: "Rating",
  review_count: "Reviews",
  chart_rank: "Chart rank",
  revenue_estimate: "Revenue est.",
  downloads_estimate: "Downloads est.",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const MAX_TEXT = 90;

function truncate(s: string): string {
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s;
}

/** Render a stored change value for its field. JSON arrays become counts. */
export function formatChangeValue(field: string, value: string | null): string {
  if (value == null || value === "") return "—";

  // JSON-array values (e.g. screenshot_urls) render as counts, never raw JSON.
  if (value.startsWith("[")) {
    try {
      const arr = JSON.parse(value) as unknown;
      if (Array.isArray(arr)) {
        const noun = field === "screenshot_urls" ? "screenshot" : "item";
        return `${arr.length} ${noun}${arr.length === 1 ? "" : "s"}`;
      }
    } catch {
      /* fall through to text */
    }
  }

  const n = Number(value);
  const numeric = value.trim() !== "" && !Number.isNaN(n);

  switch (field) {
    case "price":
      return numeric ? (n === 0 ? "Free" : `$${n.toFixed(2)}`) : truncate(value);
    case "rating":
      return numeric ? n.toFixed(2) : truncate(value);
    case "chart_rank":
      return numeric ? `#${Math.round(n)}` : truncate(value);
    case "review_count":
    case "downloads_estimate":
      return numeric ? formatCompact(n) : truncate(value);
    case "revenue_estimate":
      return numeric ? formatMoney(n) : truncate(value);
    default:
      return truncate(value);
  }
}

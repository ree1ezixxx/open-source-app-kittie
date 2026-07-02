/**
 * Request builders for the inversion intelligence tools (#190), kept pure and
 * transport-free so tool wiring can be unit-tested without booting the stdio
 * server (which connects on import). `index.ts` calls these to build the API
 * paths, then fetches them through the shared API bridge (`KITTIE_API_URL`).
 *
 * - `get_app_detail`     → app-detail intelligence path (#181)
 * - `find_trending_apps` → trends / category-pulse intelligence path (#182)
 *
 * Both target the API (never internal packages) and return the shared
 * evidence/confidence/caveats envelope.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const APP_INTELLIGENCE_BASE = "/api/v1/app-intelligence";

export type TrendPeriod = "7d" | "14d" | "30d" | "60d" | "90d";

export interface FindTrendingAppsArgs {
  category?: string;
  country?: string;
  period?: TrendPeriod;
  limit?: number;
}

const TREND_PERIODS: readonly TrendPeriod[] = ["7d", "14d", "30d", "60d", "90d"];
const DEFAULT_PERIOD: TrendPeriod = "7d";
const DEFAULT_COUNTRY = "US";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Path for the #181 app-detail intelligence response. Throws if `id` is blank. */
export function appDetailIntelligencePath(id: string): string {
  if (!id || id.trim().length === 0) throw new Error("id is required");
  return `${APP_INTELLIGENCE_BASE}/apps/${encodeURIComponent(id)}`;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function normalisePeriod(period: string | undefined): TrendPeriod {
  return TREND_PERIODS.includes(period as TrendPeriod) ? (period as TrendPeriod) : DEFAULT_PERIOD;
}

/** Path for the #182 trends intelligence response. */
export function findTrendingAppsPath(args: FindTrendingAppsArgs = {}): string {
  const qs = new URLSearchParams();
  if (args.category && args.category.trim().length > 0) qs.set("category", args.category);
  qs.set("country", args.country && args.country.trim().length > 0 ? args.country : DEFAULT_COUNTRY);
  qs.set("growthPeriod", normalisePeriod(args.period));
  qs.set("limit", String(clampLimit(args.limit)));
  return `${APP_INTELLIGENCE_BASE}/trends?${qs.toString()}`;
}

/** Turn any thrown value into an MCP tool error result an agent can read. */
export function toAgentSafeError(err: unknown): CallToolResult {
  const text = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text }], isError: true };
}

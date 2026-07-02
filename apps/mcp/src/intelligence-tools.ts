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

export const COMPARE_APPS_PATH = `${APP_INTELLIGENCE_BASE}/compare-apps`;
export const VALIDATE_IDEA_PATH = `${APP_INTELLIGENCE_BASE}/validate-idea`;

export interface AppRefInput {
  appId?: string;
  query?: string;
  store?: string;
}

export interface CompareAppsRequest {
  path: string;
  body: { apps: AppRefInput[] };
}

/** #183 compare-apps. Requires 2+ resolvable app refs (each `appId` or `query`). */
export function compareAppsRequest(args: { apps?: unknown }): CompareAppsRequest {
  const apps = args.apps;
  if (!Array.isArray(apps)) throw new Error("apps must be an array of { appId } or { query } refs");
  if (apps.length < 2) throw new Error("compare_apps needs at least 2 apps");
  const refs: AppRefInput[] = apps.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`apps[${i}] must be an object with appId or query`);
    const ref = raw as AppRefInput;
    if (!ref.appId && !ref.query) throw new Error(`apps[${i}] needs an appId or a query`);
    return ref;
  });
  return { path: COMPARE_APPS_PATH, body: { apps: refs } };
}

export interface ValidateIdeaRequest {
  path: string;
  body: { idea: string; store?: string; limit?: number };
}

/** Canonical #184 validate-idea path (`/validate-idea`, not the retired `/validate`). */
export function validateIdeaRequest(args: { idea?: unknown; store?: unknown; limit?: unknown }): ValidateIdeaRequest {
  const idea = typeof args.idea === "string" ? args.idea.trim() : "";
  if (idea.length === 0) throw new Error("validate_app_idea requires a non-empty idea");
  const body: { idea: string; store?: string; limit?: number } = { idea };
  if (args.store === "apple" || args.store === "google") body.store = args.store;
  if (typeof args.limit === "number" && Number.isFinite(args.limit)) {
    body.limit = Math.min(Math.max(Math.trunc(args.limit), 1), MAX_LIMIT);
  }
  return { path: VALIDATE_IDEA_PATH, body };
}

export type ReportTemplateName = "app_teardown" | "category_pulse" | "build_brief";
export type ReportRenderFormat = "json" | "markdown" | "html";

const REPORT_TEMPLATES: readonly ReportTemplateName[] = ["app_teardown", "category_pulse", "build_brief"];
const REPORT_FORMATS: readonly ReportRenderFormat[] = ["json", "markdown", "html"];

export interface GenerateReportArgs {
  template?: unknown;
  format?: unknown;
  appId?: unknown;
  idea?: unknown;
  store?: unknown;
  category?: unknown;
  country?: unknown;
  period?: unknown;
  limit?: unknown;
}

export interface ResolvedReportRequest {
  template: ReportTemplateName;
  format: ReportRenderFormat;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** true → the API response is `{ data: envelope }` and must be unwrapped. */
  wrapped: boolean;
}

/**
 * Resolve a `generate_report` call to the API endpoint that produces its source
 * intelligence. Rejects unknown templates/formats and missing required inputs.
 */
export function resolveReportRequest(args: GenerateReportArgs): ResolvedReportRequest {
  const template = args.template;
  if (typeof template !== "string" || !REPORT_TEMPLATES.includes(template as ReportTemplateName)) {
    throw new Error(`template must be one of: ${REPORT_TEMPLATES.join(", ")}`);
  }
  const format: ReportRenderFormat =
    args.format === undefined
      ? "json"
      : REPORT_FORMATS.includes(args.format as ReportRenderFormat)
        ? (args.format as ReportRenderFormat)
        : (() => {
            throw new Error(`format must be one of: ${REPORT_FORMATS.join(", ")}`);
          })();

  switch (template as ReportTemplateName) {
    case "app_teardown": {
      const appId = typeof args.appId === "string" ? args.appId : "";
      return { template: "app_teardown", format, method: "GET", path: appDetailIntelligencePath(appId), wrapped: true };
    }
    case "category_pulse": {
      const trendArgs: FindTrendingAppsArgs = {};
      if (typeof args.category === "string") trendArgs.category = args.category;
      if (typeof args.country === "string") trendArgs.country = args.country;
      if (typeof args.period === "string") trendArgs.period = args.period as TrendPeriod;
      if (typeof args.limit === "number") trendArgs.limit = args.limit;
      return { template: "category_pulse", format, method: "GET", path: findTrendingAppsPath(trendArgs), wrapped: false };
    }
    case "build_brief": {
      const { path, body } = validateIdeaRequest({ idea: args.idea, store: args.store, limit: args.limit });
      return { template: "build_brief", format, method: "POST", path, body, wrapped: true };
    }
  }
}

/** Turn any thrown value into an MCP tool error result an agent can read. */
export function toAgentSafeError(err: unknown): CallToolResult {
  const text = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text }], isError: true };
}

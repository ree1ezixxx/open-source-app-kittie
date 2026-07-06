/**
 * Hand-authored OpenAPI 3.1 description of the public, agent-facing READ API, plus
 * a small discovery index. The routes use plain `zod` (not @hono/zod-openapi), so
 * this document is maintained by hand and must be kept in sync with
 * `packages/api/src/routes/*` and `lib/params.ts`.
 *
 * Served at `GET /openapi.json` and `GET /api/v1/openapi.json`; the discovery index
 * at `GET /` and `GET /api/v1`. Together these are the machine-readable "front door"
 * an AI agent reads before calling a tool (ADR: agent-first surface).
 *
 * Scope: the stable READ surface an external agent can rely on. Write / streaming /
 * admin routes (sync-reviews, tracked-*, builder, clone, ai, ideas, app-engine,
 * freshness) are intentionally excluded from the agent contract.
 */

type Schema = Record<string, unknown>;

const NUM: Schema = { type: "number" };
const STR: Schema = { type: "string" };
const BOOL: Schema = { type: "boolean" };
const enumStr = (...vals: string[]): Schema => ({ type: "string", enum: vals });

function q(name: string, schema: Schema, description: string, required = false): Schema {
  return { name, in: "query", required, description, schema };
}
function pathParam(name: string, description: string): Schema {
  return { name, in: "path", required: true, description, schema: STR };
}

/** Mirrors searchParamsSchema in lib/params.ts (kept in sync by hand). */
const appSearchParameters: Schema[] = [
  q("search", STR, "Case-insensitive substring match on title/developer/description."),
  q("textSearchFields", STR, "CSV subset of `title,developer,description` to scope `search`."),
  q("categories", STR, "CSV of exact store categories to include."),
  q("excludedCategories", STR, "CSV of categories to exclude."),
  q("source", enumStr("apple", "google"), "Limit to one store."),
  q("excludedSource", enumStr("apple", "google"), "Exclude one store."),
  q("countries", STR, "CSV ISO-3166 alpha-2 markets to include. Absent = US-only default view."),
  q("excludedCountries", STR, "CSV ISO-3166 alpha-2 markets to exclude."),
  q("minDownloads", NUM, "Min modelled monthly downloads."),
  q("maxDownloads", NUM, "Max modelled monthly downloads."),
  q("minRevenue", NUM, "Min modelled monthly revenue (USD)."),
  q("maxRevenue", NUM, "Max modelled monthly revenue (USD)."),
  q("minRating", NUM, "Min average rating (0–5)."),
  q("maxRating", NUM, "Max average rating (0–5)."),
  q("minReviews", NUM, "Min review count."),
  q("maxReviews", NUM, "Max review count."),
  q("priceType", enumStr("all", "free", "paid"), "Price tier filter."),
  q("minPrice", NUM, "Min price (USD)."),
  q("maxPrice", NUM, "Max price (USD)."),
  q("growthPeriod", enumStr("7d", "14d", "30d", "60d", "90d"), "Window for live growth scoring."),
  q("growthType", enumStr("all", "positive", "negative"), "Direction of growth filter."),
  q("minGrowth", NUM, "Min growth percentage over the period."),
  q("maxGrowth", NUM, "Max growth percentage over the period."),
  q("hasMetaAds", BOOL, "Only apps with Meta ad activity (data may be empty pending ingest)."),
  q("hasAppleAds", BOOL, "Only apps with Apple Search Ads activity."),
  q("hasCreators", BOOL, "Only apps with creator/organic activity."),
  q("hasEmails", BOOL, "Only apps with a support email on file."),
  q("hasWebsite", BOOL, "Only apps with a website URL on file."),
  q("contentRating", STR, "Content-rating filter."),
  q("languages", STR, "CSV of ISO language codes; matches apps supporting ANY listed code."),
  q("developer", STR, "Substring match on developer name."),
  q("releasedAfter", NUM, "Unix seconds — released on/after this time."),
  q("updatedAfter", NUM, "Unix seconds — updated on/after this time."),
  q(
    "sortBy",
    enumStr("growth", "rating", "reviews", "updated", "released", "downloads", "revenue", "trending", "newest", "rankDelta"),
    "Sort key. growth/downloads/revenue/trending/rankDelta are computed live.",
  ),
  q("sortOrder", enumStr("asc", "desc"), "Sort direction (default desc)."),
  q("limit", { type: "integer", minimum: 1, maximum: 100 }, "Page size (≤100)."),
  q("cursor", STR, "Opaque pagination cursor returned in `pagination.nextCursor`."),
];

const jsonResponse = (description: string, schema: Schema = { type: "object" }): Schema => ({
  description,
  content: { "application/json": { schema } },
});

const envelope = (dataSchema: Schema, withMeta = false): Schema => ({
  type: "object",
  properties: {
    data: dataSchema,
    ...(withMeta ? { meta: { type: "object", description: "Source / freshness metadata." } } : {}),
  },
});

export const openapiDocument: Schema = {
  openapi: "3.1.0",
  info: {
    title: "Kittie App Intelligence API",
    version: "1.0.0",
    summary: "Mobile app intelligence for AI agents.",
    description:
      "Read API for mobile app intelligence: modelled revenue & download estimates, per-country " +
      "chart rankings with day-over-day movement and first-mover detection, ASO keyword difficulty " +
      "across markets, and review sentiment. Designed to be called by AI agents. NOTE: revenue and " +
      "download figures are MODELLED ESTIMATES, labelled as such — not ground truth.",
  },
  servers: [{ url: "/api/v1", description: "Same-origin API base (v1)." }],
  tags: [
    { name: "apps", description: "App catalog, search, detail and history." },
    { name: "charts", description: "Store rankings (Trending) with rank movement." },
    { name: "keywords", description: "ASO keyword difficulty and market analysis." },
    { name: "reviews", description: "Reviews and review coverage." },
    { name: "meta", description: "Reference data." },
  ],
  paths: {
    "/apps": {
      get: {
        tags: ["apps"],
        operationId: "searchApps",
        summary: "Search and rank apps.",
        description:
          "The core capability: filter the catalog by text, category, store, market, modelled " +
          "metrics, growth and presence signals, then sort. Returns a paginated list with a live " +
          "growth score and a review-count sparkline per app.",
        parameters: appSearchParameters,
        responses: {
          "200": jsonResponse("Paginated apps.", {
            type: "object",
            properties: {
              data: { type: "array", items: { type: "object", description: "App list item." } },
              pagination: {
                type: "object",
                properties: {
                  nextCursor: { type: ["string", "null"] },
                  totalCount: { type: "integer" },
                },
              },
            },
          }),
        },
      },
    },
    "/apps/categories": {
      get: {
        tags: ["apps"],
        operationId: "listCategories",
        summary: "Distinct categories and the stores each appears in.",
        responses: { "200": jsonResponse("Categories.", envelope({ type: "array", items: { type: "object" } })) },
      },
    },
    "/apps/{id}": {
      get: {
        tags: ["apps"],
        operationId: "getApp",
        summary: "Full detail for one app.",
        parameters: [pathParam("id", "Internal app id (e.g. `apple:123456789`).")],
        responses: {
          "200": jsonResponse("App detail.", envelope({ type: "object" })),
          "404": jsonResponse("Not found.", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/apps/{id}/about": {
      get: {
        tags: ["apps"],
        operationId: "getAppAbout",
        summary: "AI-generated narrative summary (cached).",
        parameters: [pathParam("id", "Internal app id.")],
        responses: {
          "200": jsonResponse("About narrative.", envelope({ type: "object" })),
          "404": jsonResponse("Unavailable.", { type: "object", properties: { error: STR } }),
          "502": jsonResponse("AI generation failed (transient — safe to retry).", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/apps/{id}/historicals": {
      get: {
        tags: ["apps"],
        operationId: "getAppHistoricals",
        summary: "Daily historical points (reviews, rating, chart rank) for one app.",
        parameters: [pathParam("id", "Internal app id.")],
        responses: {
          "200": jsonResponse("Historical points.", envelope({ type: "array", items: { type: "object" } })),
          "404": jsonResponse("Not found.", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/charts": {
      get: {
        tags: ["charts"],
        operationId: "getTopCharts",
        summary: "Top store rankings for a store/type/market with day-over-day movement.",
        description:
          "Resolves the latest clean ranking from chart-bearing snapshots and attaches each app's " +
          "rank movement. Overall requests with no clean source return `date:null` (honest empty), " +
          "never a fabricated chart.",
        parameters: [
          q("store", enumStr("apple", "google"), "Store.", true),
          q("type", enumStr("free", "paid", "grossing"), "Chart type (default free)."),
          q("country", STR, "ISO-3166 alpha-2 market (default US; normalized upper-case)."),
          q("category", STR, "Genre/category for a sub-chart; omit for overall."),
          q("date", STR, "ISO date (YYYY-MM-DD) to pin; omit for latest."),
          q("limit", { type: "integer", minimum: 1, maximum: 100 }, "Rows (≤100, default 100)."),
        ],
        responses: { "200": jsonResponse("Ranking + entries.", { type: "object" }) },
      },
    },
    "/keywords/difficulty": {
      get: {
        tags: ["keywords"],
        operationId: "getKeywordDifficulty",
        summary: "ASO difficulty for one keyword.",
        parameters: [
          q("keyword", STR, "The keyword.", true),
          q("country", STR, "ISO-3166 alpha-2 market (default US)."),
          q("store", enumStr("apple", "google"), "Store (default apple)."),
          q("refresh", BOOL, "Force a live re-score (bypass cache)."),
        ],
        responses: {
          "200": jsonResponse("Difficulty result.", envelope({ type: "object" }, true)),
          "400": jsonResponse("Missing keyword.", { type: "object", properties: { error: STR } }),
        },
      },
      post: {
        tags: ["keywords"],
        operationId: "batchKeywordDifficulty",
        summary: "ASO difficulty for many keywords at once.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["keywords"],
                properties: {
                  keywords: {
                    type: "array",
                    minItems: 1,
                    maxItems: 25,
                    description: "1–25 keyword tuples.",
                    items: {
                      type: "object",
                      required: ["keyword"],
                      properties: {
                        keyword: STR,
                        country: { type: "string", description: "ISO country code (default US)." },
                        store: { type: "string", enum: ["apple", "google"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse("Scored keywords.", envelope({ type: "array", items: { type: "object" } }, true)),
          "400": jsonResponse("Invalid body.", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/keywords/related": {
      get: {
        tags: ["keywords"],
        operationId: "getRelatedKeywords",
        summary: "Related keyword ideas for a seed (store autocomplete).",
        parameters: [
          q("keyword", STR, "Seed keyword.", true),
          q("country", STR, "ISO-3166 alpha-2 market (default US)."),
          q("store", enumStr("apple", "google"), "Store (default apple)."),
          q("limit", { type: "integer", minimum: 1, maximum: 30 }, "Max ideas (≤30, default 20)."),
        ],
        responses: {
          "200": jsonResponse("Related keywords.", envelope({ type: "array", items: { type: "object" } }, true)),
          "400": jsonResponse("Missing keyword.", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/keywords/markets": {
      get: {
        tags: ["keywords"],
        operationId: "getKeywordMarkets",
        summary: "Cross-market difficulty metrics for one keyword.",
        parameters: [
          q("keyword", STR, "The keyword.", true),
          q("store", enumStr("apple", "google"), "Store (default apple)."),
          q("countries", STR, "CSV ISO markets (≤16); omit for the supported-market set."),
        ],
        responses: {
          "200": jsonResponse("Per-market metrics.", envelope({ type: "array", items: { type: "object" } }, true)),
          "400": jsonResponse("Missing keyword.", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/reviews/counts": {
      get: {
        tags: ["reviews"],
        operationId: "getReviewCounts",
        summary: "Indexed review counts for a set of apps.",
        parameters: [q("ids", STR, "CSV of internal app ids.", true)],
        responses: { "200": jsonResponse("Counts by app id.", envelope({ type: "object" })) },
      },
    },
    "/reviews": {
      post: {
        tags: ["reviews"],
        operationId: "getAppReviews",
        summary: "Reviews for one app (with sentiment/topics where analysed).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["appId"],
                properties: {
                  appId: STR,
                  country: { type: "string", default: "US" },
                  limit: { type: "integer", minimum: 1, maximum: 500, default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse("Reviews.", envelope({ type: "array", items: { type: "object" } }, true)),
          "400": jsonResponse("Invalid body.", { type: "object", properties: { error: STR } }),
        },
      },
    },
    "/countries": {
      get: {
        tags: ["meta"],
        operationId: "getSupportedCountries",
        summary: "Supported markets.",
        responses: { "200": jsonResponse("Countries.", envelope({ type: "array", items: { type: "object" } })) },
      },
    },
  },
};

/** Plain-JSON "front door": what this service does + where the machine-readable bits are. */
export const discoveryIndex = {
  name: "Kittie App Intelligence",
  description:
    "Mobile app intelligence for AI agents: modelled revenue & download estimates, per-country " +
    "chart rankings with first-mover trend detection, ASO keyword difficulty, and review sentiment.",
  openapi: "/api/v1/openapi.json",
  llms_txt: "/llms.txt",
  capabilities: [
    { name: "searchApps", method: "GET", path: "/api/v1/apps", description: "Filter & rank the app catalog by metrics, growth, market and signals." },
    { name: "getApp", method: "GET", path: "/api/v1/apps/{id}", description: "Full detail for one app." },
    { name: "getTopCharts", method: "GET", path: "/api/v1/charts", description: "Store rankings (Trending) with day-over-day rank movement." },
    { name: "getKeywordDifficulty", method: "GET", path: "/api/v1/keywords/difficulty", description: "ASO keyword difficulty (single)." },
    { name: "batchKeywordDifficulty", method: "POST", path: "/api/v1/keywords/difficulty", description: "ASO keyword difficulty (batch)." },
    { name: "getKeywordMarkets", method: "GET", path: "/api/v1/keywords/markets", description: "Cross-market keyword metrics." },
    { name: "getAppReviews", method: "POST", path: "/api/v1/reviews", description: "Reviews with sentiment/topics for one app." },
    { name: "clusterReviews", method: "POST", path: "/api/v1/app-intelligence/cluster-reviews", description: "Cluster reviews across a competitor set into ranked complaint/praise/request themes with evidence." },
  ],
  mcp: {
    transport: "stdio",
    package: "@kittie/mcp",
    note: "Model Context Protocol server exposing the same capabilities as tools. Currently stdio-only; a remote (HTTP) MCP endpoint is planned.",
  },
  data_honesty:
    "Revenue and download figures are MODELLED ESTIMATES, labelled as such — not ground truth. " +
    "Blocked sources (e.g. Meta ads) return honest empty-states, never fabricated rows.",
  pricing: { tier: "free", note: "Open and free during early access; usage-based pricing for agents is planned." },
} as const;

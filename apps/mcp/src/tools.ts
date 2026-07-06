/**
 * The Kittie MCP tool catalog — pure data, no transport. Kept separate from
 * `index.ts` (which connects a stdio transport on import and would hang a test)
 * so the tool list, its safety annotations and the set of valid tool names are
 * importable and unit-testable. `index.ts` builds the server from `listTools()`.
 */

/** Schema fragment for tools that return a DecisionPacket (L2). */
export const DECISION_PACKET_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string" },
    evidence: { type: "array", items: { type: "object" } },
    confidence: { type: "object" },
    coverage: { type: "object" },
    assumptions: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    recommendedActions: { type: "array", items: { type: "object" } },
    snapshotId: { type: "string" },
  },
  required: ["decision", "evidence", "confidence", "coverage", "snapshotId"],
} as const;

/** MCP safety annotations (L5 hardening). Every read tool queries live external
 *  app-store data and is safe to repeat; only `clone_ios_app` writes output. */
export type ToolHints = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};
export const READ_ONLY: ToolHints = { readOnlyHint: true, idempotentHint: true, openWorldHint: true };
export const TOOL_ANNOTATIONS: Record<string, ToolHints> = {
  clone_ios_app: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  // Intent layer: start_mobile_build writes the local build context; get reads it.
  start_mobile_build: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  get_build_context: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

// NOTE on data honesty (true across every tool): download and revenue figures are
// MODELLED ESTIMATES, labelled as such — not ground truth. Blocked sources (e.g. Meta
// ads) return empty, never fabricated. App ids look like `apple:123456789` / `google:com.x`.
export const BASE_TOOLS = [
  {
    name: "search_apps",
    description:
      "Search and rank the mobile-app catalog (iOS + Android) by text, category, store, market, " +
      "modelled metrics, growth and presence signals. Returns a paginated list, each row carrying a " +
      "live growth score and a review-count trend. Downloads/revenue are MODELLED estimates. Use this " +
      "to find or screen apps; for the fastest-rising opportunities use find_rising_apps instead.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Substring match on title/developer/description." },
        source: { type: "string", enum: ["apple", "google"], description: "Limit to one store." },
        categories: { type: "string", description: "CSV of exact store categories." },
        countries: { type: "string", description: "CSV ISO markets (default US view)." },
        sortBy: {
          type: "string",
          enum: ["growth", "revenue", "downloads", "reviews", "rating", "trending", "rankDelta", "newest", "released", "updated"],
          description: "Sort key. growth/revenue/downloads/trending/rankDelta are computed live.",
        },
        sortOrder: { type: "string", enum: ["asc", "desc"] },
        growthPeriod: { type: "string", enum: ["7d", "14d", "30d", "60d", "90d"], description: "Window for growth scoring." },
        growthType: { type: "string", enum: ["all", "positive", "negative"] },
        minRevenue: { type: "number", description: "Min modelled monthly revenue (USD)." },
        minDownloads: { type: "number", description: "Min modelled monthly downloads." },
        minRating: { type: "number", description: "Min average rating (0–5)." },
        minReviews: { type: "number" },
        priceType: { type: "string", enum: ["all", "free", "paid"] },
        releasedAfter: { type: "number", description: "Unix seconds — released on/after." },
        hasMetaAds: { type: "boolean", description: "Only apps with Meta ad activity (may be empty pending ingest)." },
        limit: { type: "number", description: "Page size (≤100)." },
        cursor: { type: "string", description: "Pagination cursor from a prior response." },
      },
    },
  },
  {
    name: "find_rising_apps",
    description:
      "Find fast-rising, first-mover app opportunities: apps with the strongest positive growth over a " +
      "window, returned with their growth %, chart rank movement and modelled revenue/downloads. This is " +
      "the headline 'is this a rising opportunity?' verb — a thin, opinionated wrapper over search_apps " +
      "(sortBy=growth, positive growth only). Narrow by category, store or market.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Single category to scope to (optional)." },
        source: { type: "string", enum: ["apple", "google"] },
        country: { type: "string", description: "ISO market (default US)." },
        growthPeriod: { type: "string", enum: ["7d", "14d", "30d", "60d", "90d"], default: "30d" },
        minRevenue: { type: "number", description: "Optional floor on modelled monthly revenue (USD)." },
        limit: { type: "number", default: 25 },
      },
    },
  },
  {
    name: "get_trending_charts",
    description:
      "Top store rankings (Trending) for a store/type/market, with each app's day-over-day rank movement. " +
      "Resolves the latest clean ranking from chart snapshots; returns empty (date:null) when there is no " +
      "clean source — never a fabricated chart. Use for 'what's #1 in Finance on the US App Store today'.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string", enum: ["apple", "google"] },
        type: { type: "string", enum: ["free", "paid", "grossing"], default: "free" },
        country: { type: "string", default: "US" },
        category: { type: "string", description: "Genre for a sub-chart; omit for overall." },
        limit: { type: "number", default: 100, description: "Rows (≤100)." },
      },
      required: ["store"],
    },
  },
  {
    name: "get_app_detail",
    description:
      "Full intelligence profile for one app as an evidence- and confidence-aware response: listing facts, " +
      "observed signals, modelled estimates (downloads/revenue/growth — labelled), plus the supporting " +
      "evidence, a confidence score and any caveats (missing/stale sources). Pass an appId from " +
      "search_apps/find_trending_apps (e.g. `apple:123456789`).",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string" } },
      required: ["appId"],
    },
  },
  {
    name: "find_trending_apps",
    description:
      "Fastest-rising apps for a category/market over a period, returned as an evidence- and " +
      "confidence-aware trends response: each app carries chart-rank movement, review growth and a " +
      "modelled growth score, with confidence and caveats. Downloads/revenue-style figures are MODELLED. " +
      "Returns empty (never a fabricated ranking) when there is no clean snapshot for the window.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Single store category to scope to (optional)." },
        country: { type: "string", default: "US", description: "ISO market (default US)." },
        period: {
          type: "string",
          enum: ["7d", "14d", "30d", "60d", "90d"],
          default: "7d",
          description: "Growth window.",
        },
        limit: { type: "number", default: 10, description: "Max apps (≤50)." },
      },
    },
  },
  {
    name: "compare_apps",
    description:
      "Compare 2+ apps side by side as an evidence- and confidence-aware response: normalised dimensions " +
      "(rating, reviews, growth, modelled revenue/downloads, chart rank…), each app's values, and " +
      "leader/gap/missing-data insights. Pass apps by id (`apple:123` / `google:com.x`) or a free-text " +
      "query that must resolve to one app. Downloads/revenue are MODELLED estimates.",
    inputSchema: {
      type: "object",
      properties: {
        apps: {
          type: "array",
          minItems: 2,
          description: "Two or more app refs; each is { appId } or { query }, optionally with a store.",
          items: {
            type: "object",
            properties: {
              appId: { type: "string" },
              query: { type: "string" },
              store: { type: "string", enum: ["apple", "google"] },
            },
            oneOf: [{ required: ["appId"] }, { required: ["query"] }],
          },
        },
      },
      required: ["apps"],
    },
  },
  {
    name: "validate_app_idea",
    description:
      "Validate a plain-language app idea against the live market: returns a controlled verdict, risks, " +
      "opportunities, ranked competitor evidence, a confidence score and caveats — on the shared " +
      "intelligence envelope. Deterministic (no LLM guesses); thin evidence yields an honest " +
      "low-confidence verdict rather than false certainty.",
    inputSchema: {
      type: "object",
      properties: {
        idea: { type: "string", description: "The app idea, in plain language." },
        store: { type: "string", enum: ["apple", "google"], description: "Restrict competitor search to one store." },
        limit: { type: "number", description: "Max competitors considered (≤50)." },
      },
      required: ["idea"],
    },
  },
  {
    name: "generate_report",
    description:
      "Generate a local-first, evidence-backed report and return its metadata + rendered content. " +
      "Templates: `app_teardown` (needs `appId`), `category_pulse` (`category`/`country`/`period`), " +
      "`build_brief` (needs `idea`). Output `markdown`/`html`/`json` (default json). Evidence, " +
      "confidence and caveats are preserved in every format; derived brief sections are labelled.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", enum: ["app_teardown", "category_pulse", "build_brief"] },
        format: { type: "string", enum: ["json", "markdown", "html"], default: "json" },
        appId: { type: "string", description: "For app_teardown." },
        idea: { type: "string", description: "For build_brief." },
        store: { type: "string", enum: ["apple", "google"], description: "For build_brief." },
        category: { type: "string", description: "For category_pulse." },
        country: { type: "string", default: "US", description: "For category_pulse." },
        period: { type: "string", enum: ["7d", "14d", "30d", "60d", "90d"], default: "7d", description: "For category_pulse." },
        limit: { type: "number", description: "For category_pulse / build_brief." },
      },
      required: ["template"],
      // Per-template required fields (JSON Schema if/then). `category_pulse` has
      // none — omitting `category` reports across all categories by design.
      allOf: [
        {
          if: { properties: { template: { const: "app_teardown" } }, required: ["template"] },
          then: { required: ["appId"] },
        },
        {
          if: { properties: { template: { const: "build_brief" } }, required: ["template"] },
          then: { required: ["idea"] },
        },
      ],
    },
  },
  {
    name: "get_app_history",
    description:
      "Daily historical series for one app (review count, rating, chart rank) — the raw trend behind the " +
      "growth/rank-movement signals. Pass an appId.",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string" } },
      required: ["appId"],
    },
  },
  {
    name: "get_keyword_difficulty",
    description:
      "ASO difficulty for a single keyword in a market: how hard it is to rank for, with the supporting " +
      "signal. Use to size an ASO opportunity before committing to a keyword.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        country: { type: "string", default: "US" },
        store: { type: "string", enum: ["apple", "google"], default: "apple" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "batch_keyword_difficulty",
    description: "ASO difficulty for many keywords at once (each: keyword + optional country/store). Cheaper than N single calls.",
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              country: { type: "string" },
              store: { type: "string", enum: ["apple", "google"] },
            },
            required: ["keyword"],
          },
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "get_keyword_markets",
    description:
      "Cross-market ASO metrics for one keyword — its difficulty across many countries at once, the " +
      "opportunity-finder for 'which market is this keyword easiest in'.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        store: { type: "string", enum: ["apple", "google"], default: "apple" },
        countries: { type: "string", description: "CSV ISO markets (≤16); omit for the supported set." },
      },
      required: ["keyword"],
    },
  },
  {
    name: "get_related_keywords",
    description: "Related keyword ideas for a seed (store autocomplete). Feed the results to batch_keyword_difficulty to score them.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        country: { type: "string", default: "US" },
        store: { type: "string", enum: ["apple", "google"], default: "apple" },
        limit: { type: "number", default: 20 },
      },
      required: ["keyword"],
    },
  },
  {
    name: "get_supported_countries",
    description: "List the ISO market codes covered for ASO/chart lookups.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_app_reviews",
    description:
      "Recent user reviews for an app, each with stored sentiment and topic/improvement-area tags — the " +
      "raw material for 'what do users complain about'. Pass an app id.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        country: { type: "string", default: "US" },
        limit: { type: "number", default: 50, description: "Max reviews (≤500)." },
      },
      required: ["appId"],
    },
  },
  {
    name: "cluster_reviews",
    description:
      "Cluster user reviews ACROSS a competitor set into ranked themes — the 'what do users of the top N " +
      "apps actually complain about / love / ask for' verb. Pass a `query` (niche, e.g. 'sleep tracking') " +
      "to auto-resolve competitors, or an explicit `appIds` array. Each theme carries a type " +
      "(complaint/praise/request/bug/pricing/ux), frequency, mean sentiment, per-app breakdown, evidence " +
      "quotes (no reviewer identity), a rising/falling trend and confidence. Deterministic over stored " +
      "review tags; theme names are sharpened by an LLM when configured, and degrade honestly (never " +
      "fabricated) when reviews are sparse or the model is unavailable. First rung before find_feature_gaps.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Niche/description to resolve a competitor set (e.g. 'sleep tracking')." },
        appIds: {
          type: "array",
          items: { type: "string" },
          description: "Explicit competitor app ids (e.g. apple:123). Wins over query when both are given.",
        },
        country: { type: "string", default: "US", description: "ISO market." },
        limitApps: { type: "number", default: 10, description: "Max apps in the set (≤25)." },
        maxReviewsPerApp: { type: "number", default: 100, description: "Max reviews sampled per app (≤500)." },
        since: { type: "string", description: "ISO date — only cluster reviews on/after it." },
        themeTypes: {
          type: "array",
          items: { type: "string", enum: ["complaint", "praise", "request", "bug", "pricing", "ux"] },
          description: "Restrict the returned themes to these types.",
        },
        minThemeFrequency: { type: "number", default: 0.02, description: "Drop themes below this share of reviews (0–1)." },
        store: { type: "string", enum: ["apple", "google"], description: "Restrict discovery to one store (query mode)." },
      },
    },
  },
  {
    name: "find_feature_gaps",
    description:
      "Build a feature × competitor matrix for a niche: what the field OFFERS (from listings) vs what users " +
      "DEMAND (review themes), separating table-stakes features from genuine whitespace gaps. Pass a `query` " +
      "(e.g. 'sleep tracking') to auto-resolve competitors, or an explicit `appIds` array. Each feature carries " +
      "coverage (share of the field that ships it), competitorCount, demand + implementation-quality tiers, a " +
      "gap flag with a cited reason, tableStakes flag, confidence and evidence. Composes cluster_reviews for " +
      "demand; degrades to listing-only coverage when reviews are sparse. Second rung after cluster_reviews, " +
      "before rank_whitespace_ideas.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Niche/description to resolve a competitor set (e.g. 'sleep tracking')." },
        appIds: {
          type: "array",
          items: { type: "string" },
          description: "Explicit competitor app ids (e.g. apple:123). Wins over query when both are given.",
        },
        country: { type: "string", default: "US", description: "ISO market." },
        limitApps: { type: "number", default: 10, description: "Max apps in the set (≤25)." },
        includeReviewSignals: { type: "boolean", default: true, description: "Pull demand/quality from review themes (cluster_reviews)." },
        includeDescriptionSignals: { type: "boolean", default: true, description: "Extract coverage from listing descriptions." },
        minDemand: { type: "string", enum: ["low", "medium", "high"], description: "Only return features at/above this demand tier." },
        store: { type: "string", enum: ["apple", "google"], description: "Restrict discovery to one store (query mode)." },
      },
    },
  },
  {
    name: "rank_whitespace_ideas",
    description:
      "GENERATE and rank app opportunity sub-niches for a category — 'give me the 5 best sub-niches to build " +
      "in health-behaviour, ranked'. Distinct from validate_app_idea (judges ONE supplied idea): this produces " +
      "the ideas. Deterministic candidate funnel (seedIdeas + store-autocomplete keywords → cheap catalog " +
      "pre-filter → deep analysis of only the top-K via cluster_reviews + find_feature_gaps, both cached). " +
      "Each idea carries a 0–100 score with full component breakdown (demand velocity, incumbent weakness, " +
      "sentiment gap, feature gap, monetization — buildDifficulty reported but never scored), tiers, evidence, " +
      "a suggested build angle, avoidBecause warnings, confidence, and the competitor ids analysed. Funnel " +
      "counts are reported — nothing truncates silently. EVIDENCE GATES (#274): each idea carries a gateRung " +
      "(ranked | low_confidence | needs_more_sources); ideas below the scored rungs return score:null, and when " +
      "NOTHING clears a scored rung the response is status:insufficient with an explicit do-not-build caveat — " +
      "branch on gateRung/status, never on score magnitude alone. Final rung after cluster_reviews and find_feature_gaps.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "The space to generate sub-niches for (e.g. 'health-behaviour', 'sleep')." },
        country: { type: "string", default: "US", description: "ISO market." },
        limit: { type: "number", default: 5, description: "Ranked ideas to return = deep-analysis budget (≤10)." },
        seedIdeas: { type: "array", items: { type: "string" }, description: "Optional candidate niches to merge into the funnel." },
        minConfidence: { type: "number", description: "Drop ideas below this confidence (0–1)." },
        store: { type: "string", enum: ["apple", "google"], description: "Restrict competitor discovery to one store." },
      },
      required: ["category"],
    },
  },
  {
    name: "clone_ios_app",
    description:
      "Generate a complete, buildable SwiftUI iOS app that clones a trending app's core UX. " +
      "Returns an app blueprint plus every source file (project.yml + Swift) for an xcodegen project, " +
      "ready to write to disk and `xcodegen generate && xcodebuild`. Pass the app id from search_apps/get_app_detail.",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string" } },
      required: ["appId"],
    },
  },
  {
    name: "research_market_opportunity",
    description:
      "Validate an app idea/niche against the live market: pulls the competitors, ranks them, and returns " +
      "a DECISION PACKET — a verdict (build / differentiate / unvalidated) backed by observed competitor " +
      "evidence (each with a store URL), a confidence score, what's missing (e.g. ad data), and the " +
      "recommended next tools. The first call a build agent should make for a new app.",
    inputSchema: {
      type: "object",
      properties: {
        niche: { type: "string", description: "The app idea or niche, e.g. 'meditation for shift workers'." },
        source: { type: "string", enum: ["apple", "google"], description: "Limit to one store." },
        country: { type: "string", description: "ISO market (default US)." },
        limit: { type: "number", description: "Max competitors to scan (≤50, default 25)." },
      },
      required: ["niche"],
    },
    outputSchema: DECISION_PACKET_SCHEMA,
  },
  {
    name: "start_mobile_build",
    description:
      "Open a persistent build context for a new app and return its digest. Records the idea, audience, " +
      "platforms, markets, monetisation and constraints to a portable `.kittie/` folder so every later " +
      "Kittie call shares the same project understanding. Returns a `contextId` to pass onward.",
    inputSchema: {
      type: "object",
      properties: {
        idea: { type: "string" },
        audience: { type: "string" },
        platforms: { type: "array", items: { type: "string", enum: ["apple", "google"] } },
        markets: { type: "array", items: { type: "string" } },
        monetisation: { type: "string" },
        constraints: { type: "array", items: { type: "string" } },
      },
      required: ["idea"],
    },
  },
  {
    name: "get_build_context",
    description:
      "Read the current build context as a compact digest: phase, project profile, merged preferences, " +
      "open unknowns and recent decisions. Pass include=['decisions'] or ['full'] to drill down.",
    inputSchema: {
      type: "object",
      properties: {
        include: { type: "array", items: { type: "string", enum: ["decisions", "full"] } },
      },
    },
  },
] as const;

/** Every registered tool name — the source of truth other modules validate against. */
export const KITTIE_TOOL_NAMES: readonly string[] = BASE_TOOLS.map((t) => t.name);

/** The tool list with safety annotations applied, as the ListTools handler returns it. */
export function listTools() {
  return BASE_TOOLS.map((tool) => ({
    ...tool,
    annotations: TOOL_ANNOTATIONS[tool.name] ?? READ_ONLY,
  }));
}

#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AppSearchParams } from "@kittie/types";

const API_BASE = process.env.KITTIE_API_URL ?? "http://localhost:3009";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const server = new Server(
  { name: "kittie", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

// NOTE on data honesty (true across every tool): download and revenue figures are
// MODELLED ESTIMATES, labelled as such — not ground truth. Blocked sources (e.g. Meta
// ads) return empty, never fabricated. App ids look like `apple:123456789` / `google:com.x`.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
        "Full profile for one app: listing facts, latest modelled estimates, growth, and signals. " +
        "Pass an id from search_apps/find_rising_apps (e.g. `apple:123456789`).",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "get_app_history",
      description:
        "Daily historical series for one app (review count, rating, chart rank) — the raw trend behind the " +
        "growth/rank-movement signals. Pass an app id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case "search_apps": {
        const params = (args ?? {}) as AppSearchParams;
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined) qs.set(k, String(v));
        }
        result = await apiGet(`/api/v1/apps?${qs}`);
        break;
      }
      case "find_rising_apps": {
        const {
          category,
          source,
          country,
          growthPeriod = "30d",
          minRevenue,
          limit = 25,
        } = (args ?? {}) as {
          category?: string;
          source?: string;
          country?: string;
          growthPeriod?: string;
          minRevenue?: number;
          limit?: number;
        };
        const qs = new URLSearchParams({
          sortBy: "growth",
          sortOrder: "desc",
          growthType: "positive",
          growthPeriod,
          limit: String(limit),
        });
        if (category) qs.set("categories", category);
        if (source) qs.set("source", source);
        if (country) qs.set("countries", country);
        if (minRevenue !== undefined) qs.set("minRevenue", String(minRevenue));
        result = await apiGet(`/api/v1/apps?${qs}`);
        break;
      }
      case "get_trending_charts": {
        const { store, type = "free", country = "US", category, limit = 100 } = (args ?? {}) as {
          store?: string;
          type?: string;
          country?: string;
          category?: string;
          limit?: number;
        };
        if (!store) throw new Error("store is required");
        const qs = new URLSearchParams({ store, type, country, limit: String(limit) });
        if (category) qs.set("category", category);
        result = await apiGet(`/api/v1/charts?${qs}`);
        break;
      }
      case "get_app_detail": {
        const id = (args as { id?: string })?.id;
        if (!id) throw new Error("id is required");
        result = await apiGet(`/api/v1/apps/${encodeURIComponent(id)}`);
        break;
      }
      case "get_app_history": {
        const id = (args as { id?: string })?.id;
        if (!id) throw new Error("id is required");
        result = await apiGet(`/api/v1/apps/${encodeURIComponent(id)}/historicals`);
        break;
      }
      case "get_keyword_difficulty": {
        const { keyword, country = "US", store = "apple" } = (args ?? {}) as {
          keyword: string;
          country?: string;
          store?: string;
        };
        result = await apiGet(
          `/api/v1/keywords/difficulty?keyword=${encodeURIComponent(keyword)}&country=${country}&store=${store}`,
        );
        break;
      }
      case "batch_keyword_difficulty": {
        result = await apiPost("/api/v1/keywords/difficulty", args);
        break;
      }
      case "get_keyword_markets": {
        const { keyword, store = "apple", countries } = (args ?? {}) as {
          keyword?: string;
          store?: string;
          countries?: string;
        };
        if (!keyword) throw new Error("keyword is required");
        const qs = new URLSearchParams({ keyword, store });
        if (countries) qs.set("countries", countries);
        result = await apiGet(`/api/v1/keywords/markets?${qs}`);
        break;
      }
      case "get_related_keywords": {
        const { keyword, country = "US", store = "apple", limit = 20 } = (args ?? {}) as {
          keyword?: string;
          country?: string;
          store?: string;
          limit?: number;
        };
        if (!keyword) throw new Error("keyword is required");
        const qs = new URLSearchParams({ keyword, country, store, limit: String(limit) });
        result = await apiGet(`/api/v1/keywords/related?${qs}`);
        break;
      }
      case "get_supported_countries": {
        result = await apiGet("/api/v1/countries");
        break;
      }
      case "get_app_reviews": {
        const { appId, country = "US", limit = 50 } = (args ?? {}) as { appId?: string; country?: string; limit?: number };
        if (!appId) throw new Error("appId is required");
        result = await apiPost("/api/v1/reviews", { appId, country, limit });
        break;
      }
      case "clone_ios_app": {
        const { appId } = (args ?? {}) as { appId?: string };
        if (!appId) throw new Error("appId is required");
        result = await apiPost("/api/v1/clone/ios", { appId });
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

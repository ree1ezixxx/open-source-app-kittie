#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AppSearchParams, Store } from "@kittie/types";
import { createBuildContextManager, type ProfileUserValues } from "@kittie/build-context";
import { synthesizeOpportunity, type MarketApp } from "@kittie/intelligence";
import { listTools } from "./tools.js";

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

// Server-wide instructions: tell the connected agent WHEN and WHY to reach for
// Kittie across tools, so it self-invokes at the right moments (L5 hardening).
const KITTIE_INSTRUCTIONS = [
  "Kittie is the market-awareness layer for building a mobile app. Use it BEFORE",
  "and DURING a build to ground product decisions in real App Store evidence —",
  "never guess the market.",
  "",
  "Reach for it when you: validate whether an app idea is worth building, choose",
  "which feature to implement next, name/position the app for ASO, study what real",
  "users of competitors complain about, or check momentum in a niche.",
  "",
  "Honesty: download/revenue figures are MODELLED ESTIMATES (labelled). Blocked or",
  "un-fetched sources return empty with a reason — never fabricated. Treat an empty",
  "result as 'not collected', not as a market fact (e.g. no Meta ads != no demand).",
].join("\n");

const server = new Server(
  { name: "kittie", version: "0.3.0" },
  { capabilities: { tools: {} }, instructions: KITTIE_INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
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
      case "research_market_opportunity": {
        const { niche, source, country = "US", limit = 25 } = (args ?? {}) as {
          niche?: string;
          source?: string;
          country?: string;
          limit?: number;
        };
        if (!niche) throw new Error("niche is required");
        const qs = new URLSearchParams({ search: niche, countries: country, limit: String(Math.min(limit, 50)) });
        if (source) qs.set("source", source);
        const res = await apiGet<{ data?: MarketApp[] }>(`/api/v1/apps?${qs}`);
        const apps = (res.data ?? []).map((a) => ({
          id: a.id,
          store: a.store,
          title: a.title,
          rating: a.rating,
          reviewCount: a.reviewCount,
        }));
        // Read context once: rails point at start_mobile_build only when none exists,
        // and a verdict is recorded back into the context when one does (close the loop).
        const mgr = createBuildContextManager();
        const hasContext = mgr.exists();
        const packet = synthesizeOpportunity({
          niche,
          apps,
          reviewThemes: null,
          observedAt: new Date().toISOString(),
          snapshotId: `snap_${Date.now()}`,
          hasBuildContext: hasContext,
        });
        if (hasContext) {
          // Non-fatal: a context-write failure must never fail the research call itself.
          try {
            mgr.recordDecision(packet);
          } catch {
            /* swallow — the verdict is still returned to the agent */
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify(packet, null, 2) }],
          structuredContent: packet as unknown as Record<string, unknown>,
        };
      }
      case "start_mobile_build": {
        const a = (args ?? {}) as {
          idea?: string;
          audience?: string;
          platforms?: string[];
          markets?: string[];
          monetisation?: string;
          constraints?: string[];
        };
        if (!a.idea) throw new Error("idea is required");
        const profile: Partial<ProfileUserValues> = { idea: a.idea };
        if (a.audience != null) profile.audience = a.audience;
        if (a.platforms) profile.platforms = a.platforms as Store[];
        if (a.markets) profile.markets = a.markets;
        if (a.monetisation != null) profile.monetisation = a.monetisation;
        if (a.constraints) profile.constraints = a.constraints;
        const mgr = createBuildContextManager();
        if (mgr.exists()) mgr.update({ profile });
        else mgr.create({ profile });
        const digest = mgr.get();
        return {
          content: [{ type: "text", text: JSON.stringify(digest, null, 2) }],
          structuredContent: digest as unknown as Record<string, unknown>,
        };
      }
      case "get_build_context": {
        const { include } = (args ?? {}) as { include?: Array<"decisions" | "full"> };
        const mgr = createBuildContextManager();
        if (!mgr.exists()) throw new Error("No build context yet — call start_mobile_build first.");
        const digest = mgr.get({ include });
        return {
          content: [{ type: "text", text: JSON.stringify(digest, null, 2) }],
          structuredContent: digest as unknown as Record<string, unknown>,
        };
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

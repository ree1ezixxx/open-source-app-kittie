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
  { name: "kittie", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_apps",
      description: "Search and filter mobile apps with growth/revenue estimates",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string" },
          sortBy: { type: "string", enum: ["growth", "revenue", "downloads", "reviews", "rating"] },
          limit: { type: "number" },
          minRevenue: { type: "number" },
          hasMetaAds: { type: "boolean" },
          source: { type: "string", enum: ["apple", "google"] },
        },
      },
    },
    {
      name: "get_app_detail",
      description: "Get full detail for an app by id",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "get_keyword_difficulty",
      description: "Get ASO keyword difficulty for a single keyword",
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
      description: "Batch keyword difficulty (max 25)",
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
      name: "get_supported_countries",
      description: "List supported country codes for ASO lookups",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_app_reviews",
      description: "Get recent user reviews for an app (with stored sentiment and topic tags)",
      inputSchema: {
        type: "object",
        properties: {
          appId: { type: "string" },
          limit: { type: "number", default: 50 },
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
      case "get_app_detail": {
        const id = (args as { id?: string })?.id;
        if (!id) throw new Error("id is required");
        result = await apiGet(`/api/v1/apps/${encodeURIComponent(id)}`);
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
      case "get_supported_countries": {
        result = await apiGet("/api/v1/countries");
        break;
      }
      case "get_app_reviews": {
        const { appId, limit = 50 } = (args ?? {}) as { appId?: string; limit?: number };
        if (!appId) throw new Error("appId is required");
        result = await apiPost("/api/v1/reviews", { appId, limit });
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

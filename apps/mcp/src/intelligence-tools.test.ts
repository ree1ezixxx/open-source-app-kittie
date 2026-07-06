/**
 * Schema + request-builder smoke tests for the inversion intelligence tools
 * (#190). The stdio server connects a transport on import, so we test the pure,
 * transport-free pieces: the tool registry and the API path builders.
 */
import { describe, expect, it } from "vitest";
import { KITTIE_TOOL_NAMES, listTools } from "./tools.js";
import {
  appDetailIntelligencePath,
  clusterReviewsRequest,
  featureGapsRequest,
  findTrendingAppsPath,
  toAgentSafeError,
  CLUSTER_REVIEWS_PATH,
  FEATURE_GAPS_PATH,
} from "./intelligence-tools.js";

const INVERSION_TOOLS = ["get_app_detail", "find_trending_apps"] as const;

describe("inversion tool registry", () => {
  it("registers get_app_detail and find_trending_apps", () => {
    for (const name of INVERSION_TOOLS) {
      expect(KITTIE_TOOL_NAMES).toContain(name);
    }
  });

  it("lists them as read-only tools with an object input schema", () => {
    const tools = listTools();
    for (const name of INVERSION_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `${name} should be listed`).toBeDefined();
      expect(tool?.inputSchema.type).toBe("object");
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("uses the canonical `appId` arg (not `id`) on get_app_detail (#249)", () => {
    const tool = listTools().find((t) => t.name === "get_app_detail");
    const schema = tool?.inputSchema as unknown as {
      properties?: Record<string, unknown>;
      required?: readonly string[];
    };
    expect(Object.keys(schema.properties ?? {})).toEqual(["appId"]);
    expect(schema.required).toEqual(["appId"]);
  });

  it("uses the canonical `appId` arg (not `id`) on get_app_history (#249)", () => {
    const tool = listTools().find((t) => t.name === "get_app_history");
    const schema = tool?.inputSchema as unknown as {
      properties?: Record<string, unknown>;
      required?: readonly string[];
    };
    expect(Object.keys(schema.properties ?? {})).toEqual(["appId"]);
    expect(schema.required).toEqual(["appId"]);
  });

  it("keeps no MCP tool requiring a bare `id` for a store app id (#249)", () => {
    for (const tool of listTools()) {
      const required = (tool.inputSchema as unknown as { required?: readonly string[] }).required ?? [];
      expect(required, `${tool.name} should not require bare 'id'`).not.toContain("id");
    }
  });

  it("exposes category/country/period/limit on find_trending_apps", () => {
    const tool = listTools().find((t) => t.name === "find_trending_apps");
    const props = (tool?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props).sort()).toEqual(["category", "country", "limit", "period"]);
  });
});

describe("cluster_reviews registry + request builder (#259)", () => {
  it("registers cluster_reviews as a read-only object-schema tool", () => {
    expect(KITTIE_TOOL_NAMES).toContain("cluster_reviews");
    const tool = listTools().find((t) => t.name === "cluster_reviews");
    expect(tool?.inputSchema.type).toBe("object");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("requires a query or a non-empty appIds array", () => {
    expect(() => clusterReviewsRequest({})).toThrow(/query .* appIds/i);
    expect(() => clusterReviewsRequest({ appIds: [] })).toThrow();
    expect(() => clusterReviewsRequest({ appIds: ["  "] })).toThrow();
  });

  it("builds a POST body from a query and bounds the knobs", () => {
    const { path, body } = clusterReviewsRequest({
      query: "  sleep tracking ",
      limitApps: 999,
      maxReviewsPerApp: 9999,
      minThemeFrequency: 5,
      themeTypes: ["bug", "nonsense", "pricing"],
      store: "apple",
    });
    expect(path).toBe(CLUSTER_REVIEWS_PATH);
    expect(body.query).toBe("sleep tracking");
    expect(body.limitApps).toBe(25);
    expect(body.maxReviewsPerApp).toBe(500);
    expect(body.minThemeFrequency).toBe(1);
    expect(body.themeTypes).toEqual(["bug", "pricing"]);
    expect(body.store).toBe("apple");
  });

  it("passes explicit appIds through, trimmed", () => {
    const { body } = clusterReviewsRequest({ appIds: ["apple:1", " apple:2 ", 3 as unknown as string] });
    expect(body.appIds).toEqual(["apple:1", "apple:2"]);
  });
});

describe("find_feature_gaps registry + request builder (#260)", () => {
  it("registers find_feature_gaps as a read-only object-schema tool", () => {
    expect(KITTIE_TOOL_NAMES).toContain("find_feature_gaps");
    const tool = listTools().find((t) => t.name === "find_feature_gaps");
    expect(tool?.inputSchema.type).toBe("object");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("requires a query or a non-empty appIds array", () => {
    expect(() => featureGapsRequest({})).toThrow(/query .* appIds/i);
    expect(() => featureGapsRequest({ appIds: [] })).toThrow();
  });

  it("builds a POST body, bounds limitApps and validates minDemand", () => {
    const { path, body } = featureGapsRequest({
      query: "  sleep tracking ",
      limitApps: 999,
      minDemand: "high",
      includeReviewSignals: false,
      store: "apple",
    });
    expect(path).toBe(FEATURE_GAPS_PATH);
    expect(body.query).toBe("sleep tracking");
    expect(body.limitApps).toBe(25);
    expect(body.minDemand).toBe("high");
    expect(body.includeReviewSignals).toBe(false);
    expect(body.store).toBe("apple");
  });

  it("drops an invalid minDemand and passes explicit appIds trimmed", () => {
    const { body } = featureGapsRequest({ appIds: ["apple:1", " apple:2 "], minDemand: "nonsense" });
    expect(body.appIds).toEqual(["apple:1", "apple:2"]);
    expect(body.minDemand).toBeUndefined();
  });
});

describe("appDetailIntelligencePath (#181)", () => {
  it("targets the app-intelligence route and encodes the id", () => {
    expect(appDetailIntelligencePath("apple:123456789")).toBe(
      "/api/v1/app-intelligence/apps/apple%3A123456789",
    );
  });

  it("rejects a blank id", () => {
    expect(() => appDetailIntelligencePath("")).toThrow(/id is required/);
    expect(() => appDetailIntelligencePath("   ")).toThrow(/id is required/);
  });
});

describe("findTrendingAppsPath (#182)", () => {
  it("supports category, country, period, and limit", () => {
    const path = findTrendingAppsPath({
      category: "Productivity",
      country: "GB",
      period: "30d",
      limit: 5,
    });
    expect(path.startsWith("/api/v1/app-intelligence/trends?")).toBe(true);
    const qs = new URLSearchParams(path.split("?")[1]);
    expect(qs.get("category")).toBe("Productivity");
    expect(qs.get("country")).toBe("GB");
    expect(qs.get("growthPeriod")).toBe("30d");
    expect(qs.get("limit")).toBe("5");
  });

  it("defaults country=US, period=7d, limit=10 and omits an empty category", () => {
    const qs = new URLSearchParams(findTrendingAppsPath().split("?")[1]);
    expect(qs.get("country")).toBe("US");
    expect(qs.get("growthPeriod")).toBe("7d");
    expect(qs.get("limit")).toBe("10");
    expect(qs.has("category")).toBe(false);
  });

  it("clamps limit to 1..50 and rejects an unknown period", () => {
    expect(new URLSearchParams(findTrendingAppsPath({ limit: 999 }).split("?")[1]).get("limit")).toBe("50");
    expect(new URLSearchParams(findTrendingAppsPath({ limit: 0 }).split("?")[1]).get("limit")).toBe("1");
    // @ts-expect-error — invalid period falls back to the default.
    expect(new URLSearchParams(findTrendingAppsPath({ period: "bogus" }).split("?")[1]).get("growthPeriod")).toBe("7d");
  });
});

function firstText(result: { content: unknown[] }): string {
  const block = result.content[0] as { type?: string; text?: string } | undefined;
  expect(block?.type).toBe("text");
  return block?.text ?? "";
}

describe("toAgentSafeError", () => {
  it("wraps API errors as agent-safe tool errors", () => {
    const result = toAgentSafeError(new Error("API 500: upstream down"));
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("upstream down");
  });

  it("stringifies non-Error throws", () => {
    expect(firstText(toAgentSafeError("boom"))).toBe("boom");
  });
});

/**
 * Schema + request-builder smoke tests for the inversion intelligence tools
 * (#190). The stdio server connects a transport on import, so we test the pure,
 * transport-free pieces: the tool registry and the API path builders.
 */
import { describe, expect, it } from "vitest";
import { KITTIE_TOOL_NAMES, listTools } from "./tools.js";
import {
  appDetailIntelligencePath,
  findTrendingAppsPath,
  toAgentSafeError,
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

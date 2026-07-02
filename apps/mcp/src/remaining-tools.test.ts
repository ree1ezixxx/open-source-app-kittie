/**
 * Schema + request-builder tests for the remaining MVP MCP tools (#191):
 * compare_apps, validate_app_idea, generate_report. Transport-free — the stdio
 * server connects on import, so we test the registry and the pure builders.
 */
import { describe, expect, it } from "vitest";
import { KITTIE_TOOL_NAMES, listTools } from "./tools.js";
import {
  compareAppsRequest,
  resolveReportRequest,
  validateIdeaRequest,
  VALIDATE_IDEA_PATH,
} from "./intelligence-tools.js";

const NEW_TOOLS = ["compare_apps", "validate_app_idea", "generate_report"] as const;

describe("registry", () => {
  it("registers the remaining MVP tools as read-only with object schemas", () => {
    const tools = listTools();
    for (const name of NEW_TOOLS) {
      expect(KITTIE_TOOL_NAMES).toContain(name);
      const tool = tools.find((t) => t.name === name);
      expect(tool?.inputSchema.type).toBe("object");
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    }
  });
});

describe("compareAppsRequest", () => {
  it("accepts 2+ refs by id or query", () => {
    const req = compareAppsRequest({ apps: [{ appId: "apple:1" }, { query: "focus timer" }] });
    expect(req.path).toContain("/api/v1/app-intelligence/compare-apps");
    expect(req.body).toEqual({ apps: [{ appId: "apple:1" }, { query: "focus timer" }] });
  });

  it("rejects fewer than 2 apps", () => {
    expect(() => compareAppsRequest({ apps: [{ appId: "apple:1" }] })).toThrow(/at least 2/);
  });

  it("rejects a non-array and refs missing appId/query", () => {
    expect(() => compareAppsRequest({ apps: "nope" })).toThrow(/must be an array/);
    expect(() => compareAppsRequest({ apps: [{}, {}] })).toThrow(/appId or a query/);
  });

  it("rejects a ref carrying both appId and query (ambiguous)", () => {
    expect(() =>
      compareAppsRequest({ apps: [{ appId: "apple:1", query: "focus timer" }, { appId: "apple:2" }] }),
    ).toThrow(/exactly one of appId or query/);
  });

  it("treats a whitespace-only value as absent", () => {
    expect(() => compareAppsRequest({ apps: [{ appId: "   " }, { query: "focus timer" }] })).toThrow(
      /needs an appId or a query/,
    );
  });

  it("rejects an unknown store value", () => {
    expect(() =>
      compareAppsRequest({ apps: [{ appId: "apple:1", store: "bada" }, { appId: "apple:2" }] }),
    ).toThrow(/store must be/);
  });
});

describe("validateIdeaRequest", () => {
  it("targets the canonical /validate-idea path with the idea body", () => {
    const req = validateIdeaRequest({ idea: "a focus timer for students" });
    expect(req.path).toBe(VALIDATE_IDEA_PATH);
    expect(VALIDATE_IDEA_PATH).toContain("/validate-idea");
    expect(req.body).toEqual({ idea: "a focus timer for students" });
  });

  it("passes a valid store and clamps limit; rejects an empty idea", () => {
    expect(validateIdeaRequest({ idea: "x", store: "apple", limit: 999 }).body).toEqual({
      idea: "x",
      store: "apple",
      limit: 50,
    });
    expect(validateIdeaRequest({ idea: "x", store: "bogus" }).body.store).toBeUndefined();
    expect(() => validateIdeaRequest({ idea: "   " })).toThrow(/non-empty idea/);
  });
});

describe("resolveReportRequest", () => {
  it("routes app_teardown to a GET app-detail path (wrapped)", () => {
    const req = resolveReportRequest({ template: "app_teardown", appId: "apple:123" });
    expect(req.method).toBe("GET");
    expect(req.path).toContain("/app-intelligence/apps/apple%3A123");
    expect(req.wrapped).toBe(true);
    expect(req.format).toBe("json");
  });

  it("routes category_pulse to a GET trends path (top-level, not wrapped)", () => {
    const req = resolveReportRequest({ template: "category_pulse", category: "Productivity", format: "markdown" });
    expect(req.method).toBe("GET");
    expect(req.path).toContain("/app-intelligence/trends?");
    expect(req.wrapped).toBe(false);
    expect(req.format).toBe("markdown");
  });

  it("routes build_brief to a POST validate-idea (wrapped)", () => {
    const req = resolveReportRequest({ template: "build_brief", idea: "a focus timer" });
    expect(req.method).toBe("POST");
    expect(req.path).toBe(VALIDATE_IDEA_PATH);
    expect(req.wrapped).toBe(true);
    expect(req.body).toMatchObject({ idea: "a focus timer" });
  });

  it("rejects unknown templates, bad formats, and missing per-template required inputs (template-specific messages)", () => {
    expect(() => resolveReportRequest({ template: "nope" })).toThrow(/template must be one of/);
    expect(() => resolveReportRequest({ template: "app_teardown", appId: "apple:1", format: "pdf" })).toThrow(/format must be one of/);
    expect(() => resolveReportRequest({ template: "app_teardown" })).toThrow(/app_teardown requires a non-empty appId/);
    expect(() => resolveReportRequest({ template: "app_teardown", appId: "   " })).toThrow(/app_teardown requires a non-empty appId/);
    expect(() => resolveReportRequest({ template: "build_brief" })).toThrow(/build_brief requires a non-empty idea/);
  });

  it("category_pulse needs no extra fields — omitting category reports across all categories", () => {
    const req = resolveReportRequest({ template: "category_pulse" });
    expect(req.method).toBe("GET");
    expect(req.path).toContain("/app-intelligence/trends?");
    expect(req.path).not.toContain("category=");
  });
});

describe("generate_report inputSchema expresses per-template required fields", () => {
  it("declares if/then required blocks for app_teardown (appId) and build_brief (idea)", () => {
    const tool = listTools().find((t) => t.name === "generate_report");
    const schema = tool?.inputSchema as unknown as {
      required?: string[];
      allOf?: { if: unknown; then: { required: string[] } }[];
    };
    expect(schema.required).toEqual(["template"]);
    const conditionalRequired = (schema.allOf ?? []).map((c) => c.then.required.join(","));
    expect(conditionalRequired).toContain("appId");
    expect(conditionalRequired).toContain("idea");
  });
});

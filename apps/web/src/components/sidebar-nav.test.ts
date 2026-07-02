import { describe, expect, it } from "vitest";
import { DEVELOPERS, PRIMARY, SIDEBAR_LINKS } from "./Sidebar";

describe("sidebar IA (#194/#239)", () => {
  it("primary nav is the engine-first surfaces (Ask / Reports / App Intelligence)", () => {
    const primary = PRIMARY.flatMap((g) => g.items.map((i) => i.to));
    expect(primary).toEqual(["/ask", "/reports", "/intelligence"]);
  });

  it("developers group exposes MCP, API Docs, and API Keys", () => {
    expect(DEVELOPERS.items.map((i) => i.to)).toEqual(["/mcp", "/docs", "/settings/api-keys"]);
  });

  it("no retired legacy dashboard links remain in the sidebar (#239)", () => {
    for (const to of SIDEBAR_LINKS) {
      expect(to.startsWith("/dashboard/"), `${to} should not be a legacy dashboard route`).toBe(false);
      expect(to).not.toBe("/tools/pricing-calculator");
    }
  });

  it("every nav link is absolute and unique", () => {
    for (const to of SIDEBAR_LINKS) expect(to.startsWith("/")).toBe(true);
    expect(new Set(SIDEBAR_LINKS).size).toBe(SIDEBAR_LINKS.length);
  });
});

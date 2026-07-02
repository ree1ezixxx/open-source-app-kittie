import { describe, expect, it } from "vitest";
import { DEVELOPERS, LEGACY, PRIMARY, SIDEBAR_LINKS } from "./Sidebar";

describe("sidebar IA (#194)", () => {
  it("primary nav is the engine-first surfaces (Ask / Reports / App Intelligence)", () => {
    const primary = PRIMARY.flatMap((g) => g.items.map((i) => i.to));
    expect(primary).toEqual(["/ask", "/reports", "/intelligence"]);
  });

  it("developers group exposes MCP, API Docs, and API Keys", () => {
    expect(DEVELOPERS.items.map((i) => i.to)).toEqual(["/mcp", "/docs", "/settings/api-keys"]);
  });

  it("legacy dashboards are RETAINED (not deleted) under a collapsible group", () => {
    expect(LEGACY.collapsible).toBe(true);
    const legacy = LEGACY.items.map((i) => i.to);
    // The retired dashboards remain reachable through the group.
    for (const p of [
      "/dashboard/pulse",
      "/dashboard/explore",
      "/dashboard/ads",
      "/dashboard/organic",
      "/dashboard/highlights",
      "/dashboard/trending",
      "/dashboard/rising",
      "/dashboard/favorites",
      "/dashboard/aso/apps",
      "/dashboard/reviews",
      "/dashboard/hot-ideas",
      "/tools/pricing-calculator",
    ]) {
      expect(legacy).toContain(p);
    }
  });

  it("every nav link is absolute and unique (no broken/duplicate links)", () => {
    for (const to of SIDEBAR_LINKS) expect(to.startsWith("/")).toBe(true);
    expect(new Set(SIDEBAR_LINKS).size).toBe(SIDEBAR_LINKS.length);
  });
});

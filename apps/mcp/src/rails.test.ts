/**
 * MCP-boundary invariant: the next-tool rails emitted by the shared
 * `synthesizeOpportunity` synthesis must only ever name tools that are actually
 * registered in this server (guards the phantom-rails bug fixed in #123). The
 * synthesis itself lives in `@kittie/intelligence` (one decision layer); these
 * tests pin the contract between that synthesis and *this* server's registry.
 */
import { describe, expect, it } from "vitest";
import { synthesizeOpportunity, type MarketApp } from "@kittie/intelligence";
import { KITTIE_TOOL_NAMES } from "./tools.js";

const apps: MarketApp[] = [
  { id: "apple:389801252", store: "apple", title: "Instagram", rating: 4.7, reviewCount: 28_000_000 },
  { id: "google:com.zhiliaoapp.musically", store: "google", title: "TikTok", rating: 4.4, reviewCount: 60_000_000 },
  { id: "apple:333903271", store: "apple", title: "Twitter", rating: 4.0, reviewCount: 1_200_000 },
];

const base = { niche: "short-form video", observedAt: "2026-06-23T00:00:00Z", snapshotId: "snap_1" };

describe("synthesizeOpportunity → MCP tool rails", () => {
  it("only ever recommends tools that are actually registered (no phantom rails)", () => {
    const cases: MarketApp[][] = [apps, [], apps.slice(0, 1)];
    for (const a of cases) {
      for (const hasBuildContext of [false, true]) {
        const p = synthesizeOpportunity({ ...base, apps: a, reviewThemes: null, hasBuildContext });
        expect(p.recommendedActions.length).toBeGreaterThan(0);
        for (const action of p.recommendedActions) {
          expect(KITTIE_TOOL_NAMES).toContain(action.tool);
        }
      }
    }
  });

  it("only steers to start_mobile_build when no build context exists yet", () => {
    const fresh = synthesizeOpportunity({ ...base, apps, reviewThemes: null, hasBuildContext: false });
    const ongoing = synthesizeOpportunity({ ...base, apps, reviewThemes: null, hasBuildContext: true });
    expect(fresh.recommendedActions.some((a) => a.tool === "start_mobile_build")).toBe(true);
    expect(ongoing.recommendedActions.some((a) => a.tool === "start_mobile_build")).toBe(false);
  });
});

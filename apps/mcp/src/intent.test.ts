import { describe, expect, it } from "vitest";
import { appStoreUrl, synthesizeOpportunity, type MarketApp } from "./intent.js";
import { KITTIE_TOOL_NAMES } from "./tools.js";

const apps: MarketApp[] = [
  { id: "apple:389801252", store: "apple", title: "Instagram", rating: 4.7, reviewCount: 28_000_000 },
  { id: "google:com.zhiliaoapp.musically", store: "google", title: "TikTok", rating: 4.4, reviewCount: 60_000_000 },
  { id: "apple:333903271", store: "apple", title: "Twitter", rating: 4.0, reviewCount: 1_200_000 },
];

const base = { niche: "short-form video", observedAt: "2026-06-23T00:00:00Z", snapshotId: "snap_1" };

describe("appStoreUrl", () => {
  it("builds apple + google store URLs from the prefixed id", () => {
    expect(appStoreUrl(apps[0]!)).toBe("https://apps.apple.com/app/id389801252");
    expect(appStoreUrl(apps[1]!)).toBe(
      "https://play.google.com/store/apps/details?id=com.zhiliaoapp.musically",
    );
  });
});

describe("synthesizeOpportunity", () => {
  it("grounds every competitor claim in an observed store URL", () => {
    const p = synthesizeOpportunity({ ...base, apps, reviewThemes: null });
    const observed = p.evidence.filter((e) => e.valueType === "observed");
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every((e) => e.sourceUrl?.startsWith("https://"))).toBe(true);
  });

  it("always declares ad spend as a missing source, never fabricates it", () => {
    const p = synthesizeOpportunity({ ...base, apps, reviewThemes: null });
    expect(p.coverage.missing).toContain("Meta advertising data");
    expect(p.coverage.missing).toContain("competitor review themes");
    expect(p.coverage.status).toBe("partial");
  });

  it("folds mined review themes into derived evidence and drops them from missing", () => {
    const p = synthesizeOpportunity({ ...base, apps, reviewThemes: ["crashes", "paywall"] });
    expect(p.coverage.missing).not.toContain("competitor review themes");
    expect(p.evidence.some((e) => e.valueType === "derived" && e.claim.includes("paywall"))).toBe(true);
  });

  it("flags an empty niche as unvalidated with demand as an explicit unknown", () => {
    const p = synthesizeOpportunity({ ...base, apps: [], reviewThemes: null });
    expect(p.decision).toMatch(/unvalidated/);
    expect(p.unknowns).toContain("actual user demand for this niche");
    expect(p.coverage.status).toBe("none");
  });

  it("calls a crowded niche crowded and scales confidence with the sample", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `apple:${i}`,
      store: "apple",
      title: `App ${i}`,
      rating: 4.0,
      reviewCount: 1000 + i,
    }));
    const crowded = synthesizeOpportunity({ ...base, apps: many, reviewThemes: null });
    const thin = synthesizeOpportunity({ ...base, apps: apps.slice(0, 1), reviewThemes: null });
    expect(crowded.decision).toMatch(/crowded/);
    expect(crowded.confidence.score).toBeGreaterThan(thin.confidence.score);
  });

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

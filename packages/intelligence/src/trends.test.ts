import { describe, expect, it } from "vitest";
import { buildCategoryPulseResponse, type CategoryPulseAppInput } from "./trends.js";

const app: CategoryPulseAppInput = {
  id: "apple:123456789",
  store: "apple",
  title: "Focus Timer",
  developer: "Focus Co",
  category: "Productivity",
  rating: 4.8,
  reviewCount: 18420,
  reviewGrowth7d: 320,
  growthPct: 12.4,
  growthScore: 78,
  rankDelta: 8,
};

function build(overrides: Partial<Parameters<typeof buildCategoryPulseResponse>[0]> = {}) {
  return buildCategoryPulseResponse({
    category: "Productivity",
    country: "US",
    growthPeriod: "7d",
    limit: 10,
    apps: [app],
    snapshotDate: "2026-07-01",
    generatedAt: "2026-07-01T12:00:00Z",
    ...overrides,
  });
}

describe("category pulse response", () => {
  it("returns ranked apps with market movement evidence", () => {
    const response = build();

    expect(response.responseType).toBe("trends");
    expect(response.status).toBe("ok");
    expect(response.data.apps[0]).toMatchObject({
      rank: 1,
      appId: "apple:123456789",
      movement: {
        reviewGrowth: 320,
        reviewGrowthPct: 12.4,
        rankDelta: 8,
        growthScore: 78,
      },
    });
    expect(response.data.apps[0]?.evidenceIds).toHaveLength(2);
    expect(response.evidence.map((e) => e.metric?.name)).toEqual(["growth_score", "review_count"]);
    expect(response.confidence.score).toBeGreaterThan(0.7);
  });

  it("returns honest caveats and insufficient confidence for empty Snapshot results", () => {
    const response = build({ apps: [], snapshotDate: null });

    expect(response.status).toBe("insufficient");
    expect(response.data.apps).toEqual([]);
    expect(response.confidence).toMatchObject({ score: 0, label: "insufficient" });
    expect(response.caveats).toContainEqual({
      kind: "missing_source",
      sourceType: "snapshot",
      message: "No Snapshot rows matched this category/country query.",
    });
  });

  it("caps confidence and marks evidence stale when Snapshot data is stale", () => {
    const response = build({
      snapshotDate: "2026-06-20",
      generatedAt: "2026-07-01T12:00:00Z",
    });

    expect(response.status).toBe("ok");
    expect(response.confidence.score).toBeLessThanOrEqual(0.39);
    expect(response.confidence.label).toBe("low");
    expect(response.evidence.every((e) => e.freshness === "stale" && e.sourceStatus === "stale")).toBe(true);
    expect(response.caveats.some((c) => c.kind === "stale_source" && c.sourceType === "snapshot")).toBe(true);
  });
});

import type { AppDetail } from "@kittie/types";
import { describe, expect, it } from "vitest";
import { buildAppCanvasGraph } from "./buildAppCanvasGraph";

function stubApp(overrides: Partial<AppDetail> = {}): AppDetail {
  return {
    id: "apple:1",
    store: "apple",
    storeAppId: "1",
    title: "Test App",
    developer: "Dev Co",
    category: "Utilities",
    iconUrl: null,
    rating: 4.5,
    reviewCount: 1200,
    downloadsEstimate30d: 50_000,
    revenueEstimate30d: 10_000,
    growthScore: 42,
    growthPct: 3.2,
    rankDelta: 2,
    sparkline: [1, 2, 3],
    historicals: [],
    screenshotUrls: [],
    metaAds: [],
    creators: [],
    appleSearchAds: [],
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  } as AppDetail;
}

describe("buildAppCanvasGraph", () => {
  it("builds seven spoke nodes plus the app root", () => {
    const { nodes, edges } = buildAppCanvasGraph(stubApp(), [], []);
    expect(nodes).toHaveLength(8);
    expect(edges).toHaveLength(7);
  });

  it("keeps listing spoke filled when metadata exists without screenshots", () => {
    const { nodes } = buildAppCanvasGraph(stubApp({ screenshotUrls: [] }), [], []);
    const listing = nodes.find((n) => n.id === "listing");
    expect(listing?.data).toMatchObject({ empty: false, facts: expect.any(Array) });
  });

  it("marks listing spoke empty only when no listing metadata exists", () => {
    const { nodes } = buildAppCanvasGraph(
      stubApp({ screenshotUrls: [], developer: "", updatedAt: null }),
      [],
      [],
    );
    const listing = nodes.find((n) => n.id === "listing");
    expect(listing?.data).toMatchObject({ empty: true });
  });

  it("uses dashed edges for empty spokes and solid edges for filled spokes", () => {
    const { edges } = buildAppCanvasGraph(stubApp(), [{ id: "r1", rating: 5, title: "Nice", body: "Good" } as never], []);
    const reviewsEdge = edges.find((e) => e.source === "reviews");
    const adsEdge = edges.find((e) => e.source === "ads");
    expect(reviewsEdge?.style?.strokeDasharray).toBeUndefined();
    expect(adsEdge?.style?.strokeDasharray).toBe("6 4");
  });
});

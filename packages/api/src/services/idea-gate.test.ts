import { describe, expect, it } from "vitest";
import type { IdeaCandidate } from "@kittie/db";

import { gateScore, gateWeights, selectIdeaSources } from "./idea-gate.js";

const NOW = Date.UTC(2026, 5, 10);
const DAY = 86_400_000;

const candidate = (over: Partial<IdeaCandidate>): IdeaCandidate => ({
  appId: "app-x",
  storeAppId: "1",
  store: "apple",
  title: "X",
  category: "Finance",
  description: null,
  price: 0,
  releasedAt: new Date(NOW - 1000 * DAY),
  reviewCount: 500,
  rating: 4.5,
  downloadsEstimate: 1000,
  revenueEstimate: 0,
  growthScore: 0,
  chartRank: null,
  ...over,
});

describe("gateWeights", () => {
  it("distrusts growth while snapshot history is thin", () => {
    const thin = gateWeights(3);
    expect(thin.rising).toBeLessThan(0.2);
    expect(thin.lowFruit).toBeGreaterThan(0.5);
  });

  it("shifts weight toward growth as history accrues", () => {
    const thin = gateWeights(3);
    const mature = gateWeights(21);
    expect(mature.rising).toBeGreaterThan(thin.rising);
    expect(mature.rising).toBeCloseTo(0.4, 5);
  });

  it("weights always sum to 1", () => {
    for (const days of [0, 3, 10, 21, 100]) {
      const w = gateWeights(days);
      expect(w.rising + w.recency + w.lowFruit).toBeCloseTo(1, 10);
    }
  });
});

describe("gateScore", () => {
  const weights = gateWeights(3);

  it("rewards the low-hanging-fruit profile: high revenue, weak rating", () => {
    const fumbling = candidate({ revenueEstimate: 25_000, rating: 3.2 });
    const beloved = candidate({ revenueEstimate: 25_000, rating: 4.9 });
    expect(gateScore(fumbling, weights, NOW)).toBeGreaterThan(gateScore(beloved, weights, NOW));
  });

  it("ignores rating gaps with no revenue behind them (no proven demand)", () => {
    const noDemand = candidate({ revenueEstimate: 0, rating: 2.0 });
    const demand = candidate({ revenueEstimate: 20_000, rating: 2.0 });
    expect(gateScore(demand, weights, NOW)).toBeGreaterThan(gateScore(noDemand, weights, NOW));
  });

  it("rewards recent releases", () => {
    const fresh = candidate({ releasedAt: new Date(NOW - 30 * DAY) });
    const ancient = candidate({ releasedAt: new Date(NOW - 1500 * DAY) });
    expect(gateScore(fresh, weights, NOW)).toBeGreaterThan(gateScore(ancient, weights, NOW));
  });

  it("rewards charting apps within the rising signal", () => {
    const charting = candidate({ chartRank: 5, growthScore: 50 });
    const offChart = candidate({ chartRank: null, growthScore: 50 });
    expect(gateScore(charting, weights, NOW)).toBeGreaterThan(gateScore(offChart, weights, NOW));
  });
});

describe("selectIdeaSources", () => {
  it("returns the top-scored candidates, capped at limit", () => {
    const pool = [
      candidate({ appId: "a", revenueEstimate: 30_000, rating: 3.0 }),
      candidate({ appId: "b", revenueEstimate: 0, rating: 4.9, releasedAt: new Date(NOW - 2000 * DAY) }),
      candidate({ appId: "c", revenueEstimate: 15_000, rating: 3.5 }),
    ];
    const picked = selectIdeaSources(pool, 3, 2, NOW);
    expect(picked.map((c) => c.appId)).toEqual(["a", "c"]);
  });

  it("is deterministic on score ties", () => {
    const pool = [candidate({ appId: "b" }), candidate({ appId: "a" })];
    const picked = selectIdeaSources(pool, 3, 2, NOW);
    expect(picked.map((c) => c.appId)).toEqual(["a", "b"]);
  });
});

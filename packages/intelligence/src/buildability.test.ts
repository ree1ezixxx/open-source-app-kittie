import { describe, it, expect } from "vitest";
import { computeBuildability } from "./buildability.js";

describe("computeBuildability", () => {
  it("a simple utility is more buildable than a regulated fintech app", () => {
    const utility = computeBuildability({ category: "Utilities", iapCount: 1 });
    const fintech = computeBuildability({ category: "Finance", iapCount: 1 });
    expect(utility.score).toBeGreaterThan(fintech.score);
  });

  it("games (high asset burden) score lower than a productivity app", () => {
    const game = computeBuildability({ category: "Games", iapCount: 2 });
    const productivity = computeBuildability({ category: "Productivity", iapCount: 2 });
    expect(productivity.score).toBeGreaterThan(game.score);
  });

  it("more IAP surface lowers buildability", () => {
    const lean = computeBuildability({ category: "Productivity", iapCount: 0 });
    const heavy = computeBuildability({ category: "Productivity", iapCount: 8 });
    expect(lean.score).toBeGreaterThan(heavy.score);
  });

  it("scores are bounded 0..100 and factors 0..1", () => {
    const r = computeBuildability({ category: "Medical", iapCount: 20 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.factors.regulatoryRisk).toBeLessThanOrEqual(1);
  });

  it("missing category still scores, with a caveat note", () => {
    const r = computeBuildability({ category: null, iapCount: 1 });
    expect(typeof r.score).toBe("number");
    expect(r.note).toMatch(/no category/i);
  });
});

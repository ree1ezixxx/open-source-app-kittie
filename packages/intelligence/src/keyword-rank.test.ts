import { describe, expect, it } from "vitest";

import { resolveKeywordPosition } from "./keyword-rank.js";

describe("resolveKeywordPosition", () => {
  it("returns the matched store search position", () => {
    expect(resolveKeywordPosition([
      { storeAppId: "111", rank: 1 },
      { storeAppId: "222", rank: 2 },
    ], "222")).toBe(2);
  });

  it("returns positions outside the displayed top 10", () => {
    const results = Array.from({ length: 25 }, (_, index) => ({
      storeAppId: String(index + 1),
      rank: index + 1,
    }));

    expect(resolveKeywordPosition(results, "18")).toBe(18);
  });

  it("returns null when the app is not ranked", () => {
    expect(resolveKeywordPosition([{ storeAppId: "111", rank: 1 }], "333")).toBeNull();
  });
});

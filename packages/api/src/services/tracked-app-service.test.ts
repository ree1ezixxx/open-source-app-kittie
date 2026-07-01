import { describe, expect, it } from "vitest";

import {
  buildKeywordGenerationInput,
  InvalidKeywordError,
  normalizeGeneratedKeywords,
} from "./tracked-app-service.js";

describe("tracked app generated keywords", () => {
  it("normalizes, dedupes, and caps generated keywords", () => {
    const out = normalizeGeneratedKeywords(
      [
        " Mahjong Solitaire ",
        "mahjong-solitaire",
        "THE Free App",
        "Tile Match Puzzle!!!",
        "a",
        "one two three four five six",
        42,
      ],
      3,
    );

    expect(out).toEqual(["mahjong solitaire", "tile match puzzle"]);
  });

  it("builds a stable metadata input without unbounded descriptions", () => {
    const input = buildKeywordGenerationInput({
      title: "Mahjong Solitaire",
      developer: "Puzzle Co",
      category: "Games",
      description: "x".repeat(3_000),
    });
    const parsed = JSON.parse(input) as { title: string; description: string };

    expect(parsed.title).toBe("Mahjong Solitaire");
    expect(parsed.description).toHaveLength(2_500);
  });

  it("exports InvalidKeywordError for route handling", () => {
    expect(new InvalidKeywordError().message).toBe("keyword is invalid");
  });
});

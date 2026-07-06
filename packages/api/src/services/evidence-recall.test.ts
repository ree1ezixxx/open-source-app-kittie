import { describe, expect, it } from "vitest";
import { scoreReviewedApps, stem } from "./evidence-recall.js";

const ROWS = [
  { id: "apple:ynab", title: "YNAB", category: "Finance", description: "The best budget app. Budgeting that actually works." },
  { id: "apple:calm", title: "Calm", category: "Health & Fitness", description: "Sleep, meditation and relaxation." },
  { id: "apple:duo", title: "Duolingo", category: "Education", description: "Learn languages with fun lessons. Language learning for everyone." },
  { id: "apple:mfp", title: "MyFitnessPal", category: "Health & Fitness", description: "Calorie counter and diet tracker." },
  // Round-2 cold-verify false-positive classes:
  { id: "apple:bose", title: "Bose", category: "Music", description: "Control your speakers and media playback." },
  { id: "apple:claude", title: "Claude by Anthropic", category: "Productivity", description: "AI assistant that understands language." },
];

describe("stem", () => {
  it("strips morphology deterministically", () => {
    expect(stem("budgeting")).toBe("budget");
    expect(stem("learning")).toBe("learn");
    expect(stem("planning")).toBe("plan");
    expect(stem("running")).toBe("run");
    expect(stem("meditation")).toBe("meditation"); // no bare-prefix nonsense
    expect(stem("media")).toBe("media");
  });
});

describe("scoreReviewedApps (#268 round 3)", () => {
  it("YNAB case survives: single-token query, description-stem match", () => {
    const hits = scoreReviewedApps("budgeting", ROWS, 5);
    expect(hits.map((h) => h.id)).toContain("apple:ynab");
  });

  it("Bose/'media' class DEAD: stem equality, not prefixes", () => {
    const hits = scoreReviewedApps("meditation", ROWS, 5);
    expect(hits.map((h) => h.id)).toEqual(["apple:calm"]);
  });

  it("one stray description word never recalls for a multi-token query (Claude class)", () => {
    const hits = scoreReviewedApps("language learning", ROWS, 5);
    expect(hits.map((h) => h.id)).toEqual(["apple:duo"]); // 2 desc hits; Claude's single 'language' excluded
  });

  it("title hits outrank description-only hits", () => {
    const rows = [
      { id: "a", title: "Budget Planner", category: null, description: "" },
      { id: "b", title: "Money Thing", category: null, description: "great for budgeting and budgets" },
    ];
    expect(scoreReviewedApps("budgeting", rows, 5).map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("garbage query recalls nothing", () => {
    expect(scoreReviewedApps("zzqx flurbin", ROWS, 5)).toEqual([]);
  });
});

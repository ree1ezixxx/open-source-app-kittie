import { describe, expect, it } from "vitest";
import { scoreReviewedApps } from "./evidence-recall.js";

const ROWS = [
  { id: "apple:ynab", title: "YNAB", category: "Finance", description: "The best budget app. Budgeting that actually works." },
  { id: "apple:cal", title: "Calm", category: "Health & Fitness", description: "Sleep, meditation and relaxation." },
  { id: "apple:duo", title: "Duolingo", category: "Education", description: "Learn languages with fun lessons. Language learning for everyone." },
  { id: "apple:mfp", title: "MyFitnessPal", category: "Health & Fitness", description: "Calorie counter and diet tracker." },
];

describe("scoreReviewedApps (#268 recall pass)", () => {
  it("recalls incumbents whose TITLE lacks the token but description matches (the YNAB case)", () => {
    const hits = scoreReviewedApps("budgeting", ROWS, 5);
    expect(hits.map((h) => h.id)).toContain("apple:ynab");
    expect(hits[0]!.matched).toContain("budgeting");
  });

  it("prefix morphology: budgeting~budget, meditation~meditation", () => {
    expect(scoreReviewedApps("meditation", ROWS, 5).map((h) => h.id)).toContain("apple:cal");
    expect(scoreReviewedApps("language learning", ROWS, 5)[0]!.id).toBe("apple:duo");
  });

  it("relevance guard: zero-token-match apps are never recalled", () => {
    const hits = scoreReviewedApps("budgeting", ROWS, 5);
    expect(hits.map((h) => h.id)).not.toContain("apple:mfp");
    expect(hits.map((h) => h.id)).not.toContain("apple:cal");
  });

  it("empty/garbage query recalls nothing", () => {
    expect(scoreReviewedApps("zz qq", ROWS, 5)).toEqual([]);
  });
});

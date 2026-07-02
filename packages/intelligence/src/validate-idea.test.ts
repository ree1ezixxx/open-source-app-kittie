import { describe, expect, it } from "vitest";
import type { AppListItem, InterpretedIdea, SimilarApp } from "@kittie/types";
import { buildValidateIdeaResponse, ValidateIdeaInputError } from "./validate-idea.js";

const generatedAt = "2026-07-02T12:00:00.000Z";

function appItem(overrides: Partial<AppListItem> = {}): AppListItem {
  return {
    id: "app_1",
    store: "apple",
    storeAppId: "123456789",
    title: "Sober Coach",
    iconUrl: null,
    developer: "Example Studio",
    category: "Health & Fitness",
    rating: 4.7,
    reviewCount: 24800,
    reviewGrowth7d: 140,
    downloadsEstimate30d: 32000,
    revenueEstimate30d: 51000,
    growthScore: 72,
    growthPct: 0.09,
    downloadsEstimatePrior: 30000,
    revenueEstimatePrior: 48000,
    rankDelta: 2,
    isFirstMover: false,
    releasedAt: "2024-03-01T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function competitor(overrides: Partial<SimilarApp> = {}, app: Partial<AppListItem> = {}): SimilarApp {
  return {
    app: appItem(app),
    similarityScore: 0.82,
    similarityClass: "direct",
    similarityReasons: ["keyword overlap: sobriety, coach"],
    matchedVia: ["fts_keyword", "category_peer"],
    ...overrides,
  };
}

function interpreted(overrides: Partial<InterpretedIdea> = {}): InterpretedIdea {
  return {
    summary: "a sobriety coaching app",
    categories: ["Health & Fitness"],
    keywords: ["sobriety", "coach", "habit"],
    kind: "inferred",
    ...overrides,
  };
}

describe("validate-idea intelligence", () => {
  it("returns a grounded verdict with risks, opportunities, and competitor evidence on strong evidence", () => {
    const competitors: SimilarApp[] = Array.from({ length: 8 }, (_, i) =>
      competitor(
        { similarityClass: i < 5 ? "direct" : "adjacent" },
        {
          id: `app_${i + 1}`,
          storeAppId: `${1000 + i}`,
          title: `Sober App ${i + 1}`,
          reviewCount: 20000 + i * 5000,
          rating: 4.5,
          growthScore: 60 + i,
        },
      ),
    );

    const result = buildValidateIdeaResponse({
      idea: "An app that helps people stay sober with a daily coach",
      interpreted: interpreted(),
      competitors,
      reviewThemes: ["pricing complaints", "sync bugs", "missing widgets"],
      generatedAt,
      sourceQuery: { idea: "sober coach" },
    });

    expect(result.responseType).toBe("idea_validation");
    expect(["strong_opportunity", "has_room", "crowded", "saturated"]).toContain(result.data.verdict);
    expect(result.data.likelyCategory).toBe("Health & Fitness");
    expect(result.data.competitors).toHaveLength(8);
    expect(result.data.competitors[0]?.evidenceIds.length).toBeGreaterThan(0);
    // Every competitor evidence id resolves to a real envelope evidence entry.
    const evidenceIds = new Set(result.evidence.map((entry) => entry.id));
    for (const row of result.data.competitors) {
      for (const id of row.evidenceIds) expect(evidenceIds.has(id)).toBe(true);
    }
    expect(result.data.opportunities.some((o) => o.message.includes("pricing complaints"))).toBe(true);
    expect(result.data.risks.length).toBeGreaterThan(0);
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.6);
    expect(result.status).toBe("ok");
    // Modelled metrics are labelled, never presented as Store truth.
    expect(result.evidence.filter((entry) => entry.valueKind === "modelled").length).toBeGreaterThan(0);
    expect(result.caveats.some((caveat) => caveat.kind === "estimated_metric")).toBe(true);
  });

  it("degrades to a low-confidence, conservative verdict on weak evidence", () => {
    const result = buildValidateIdeaResponse({
      idea: "A niche app for collecting rare bottle caps",
      interpreted: interpreted({ summary: "a bottle cap collecting app", keywords: ["bottle", "caps"], categories: [] }),
      competitors: [
        competitor({ similarityClass: "adjacent" }, { id: "app_1", title: "Cap Tracker", reviewCount: 12, rating: null, growthScore: null, category: "Lifestyle" }),
        competitor({ similarityClass: "adjacent" }, { id: "app_2", storeAppId: "222", title: "Collector Log", reviewCount: 9, rating: 3.1, growthScore: null, category: "Lifestyle" }),
      ],
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea: "bottle caps" },
    });

    expect(result.data.verdict).toBe("not_enough_data");
    expect(result.confidence.label).toBe("low");
    expect(result.confidence.score).toBeLessThanOrEqual(0.4);
    expect(result.status).toBe("partial");
    expect(result.caveats.some((caveat) => caveat.kind === "weak_evidence")).toBe(true);
    expect(result.data.likelyCategory).toBe("Lifestyle");
    // No fabricated strong recommendation.
    expect(result.data.verdict).not.toBe("strong_opportunity");
  });

  it("flags an ambiguous idea and caps confidence instead of guessing", () => {
    const result = buildValidateIdeaResponse({
      idea: "something something for everyone",
      interpreted: interpreted({ summary: "something something for everyone", keywords: [], categories: [] }),
      competitors: [competitor({}, { reviewCount: 800 })],
      reviewThemes: [],
      missing: ["no usable keywords parsed from the idea"],
      generatedAt,
      sourceQuery: { idea: "something something for everyone" },
    });

    expect(result.confidence.score).toBeLessThanOrEqual(0.3);
    expect(result.confidence.label).toBe("low");
    expect(
      result.caveats.some((caveat) => caveat.kind === "weak_evidence" && caveat.message.includes("ambiguous")),
    ).toBe(true);
    expect(result.caveats.some((caveat) => caveat.message.includes("no usable keywords"))).toBe(true);
  });

  it("returns an honest insufficient response when no competitors are found", () => {
    const result = buildValidateIdeaResponse({
      idea: "An app that translates whale song into sea shanties",
      interpreted: interpreted({ summary: "a whale song translator", keywords: ["whale", "song"], categories: [] }),
      competitors: [],
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea: "whale song translator" },
    });

    expect(result.data.verdict).toBe("unvalidated");
    expect(result.status).toBe("insufficient");
    expect(result.confidence.label).toBe("insufficient");
    expect(result.data.competitors).toHaveLength(0);
    expect(result.data.likelyCategory).toBeNull();
    // Only the interpretation evidence exists — no fabricated competitor rows.
    expect(result.evidence.every((entry) => !entry.id.includes("competitor"))).toBe(true);
    expect(result.caveats.some((caveat) => caveat.message.includes("No competitors surfaced"))).toBe(true);
  });

  it("rejects an empty idea", () => {
    expect(() =>
      buildValidateIdeaResponse({
        idea: "   ",
        interpreted: interpreted(),
        competitors: [],
        generatedAt,
        sourceQuery: {},
      }),
    ).toThrow(ValidateIdeaInputError);
  });
});

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

  it("flags an ambiguous idea, caps the verdict AND confidence instead of guessing", () => {
    // Strong-looking namesake competitors: without the ambiguity guard these
    // would produce a strong verdict from pure noise.
    const namesakes: SimilarApp[] = Array.from({ length: 3 }, (_, i) =>
      competitor({ similarityClass: "direct" }, {
        id: `app_${i + 1}`,
        storeAppId: `${2000 + i}`,
        reviewCount: 50000,
        rating: 4.8,
        growthScore: 80,
      }),
    );
    const result = buildValidateIdeaResponse({
      idea: "something something for everyone",
      interpreted: interpreted({ summary: "something something for everyone", keywords: [], categories: [] }),
      competitors: namesakes,
      reviewThemes: ["pricing complaints", "sync bugs", "crashes"],
      missing: ["no usable keywords parsed from the idea"],
      generatedAt,
      sourceQuery: { idea: "something something for everyone" },
    });

    // Ambiguity must soften the VERDICT, not just confidence — an agent
    // branching on `verdict` never sees a strong label from an unparseable idea.
    expect(result.data.verdict).toBe("not_enough_data");
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

  it("#246: does not pin confidence at 0.59 when review themes are unavailable, and confidence still moves", () => {
    // Production reality: the reviews table is too sparse to mine themes catalog-wide,
    // so reviewThemes is empty for essentially every real idea. Previously this tripped
    // the missing-source floor and pinned EVERY data-bearing idea to exactly 0.59/low.
    const strongCompetitors: SimilarApp[] = Array.from({ length: 8 }, (_, i) =>
      competitor({ similarityClass: i < 5 ? "direct" : "adjacent" }, {
        id: `s_${i + 1}`,
        storeAppId: `${3000 + i}`,
        title: `Sober App ${i + 1}`,
        reviewCount: 40000 + i * 5000,
        rating: 4.5,
        growthScore: 70,
      }),
    );
    const strong = buildValidateIdeaResponse({
      idea: "An app that helps people stay sober with a daily coach",
      interpreted: interpreted(),
      competitors: strongCompetitors,
      reviewThemes: [], // themes unavailable — the production condition
      generatedAt,
      sourceQuery: { idea: "sober coach" },
    });

    const weak = buildValidateIdeaResponse({
      idea: "A niche app for collecting rare bottle caps",
      interpreted: interpreted({ keywords: ["bottle", "caps"], categories: ["Lifestyle"] }),
      competitors: [
        competitor({ similarityClass: "adjacent" }, { id: "w_1", title: "Cap Tracker", reviewCount: 14, rating: null, growthScore: null, category: "Lifestyle" }),
      ],
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea: "bottle caps" },
    });

    // The pin is gone: a strong idea is no longer floored to 0.59.
    expect(strong.confidence.score).toBeGreaterThan(0.59);
    // ...but honesty holds: with the differentiation dimension unmined it never claims "high".
    expect(strong.confidence.score).toBeLessThan(0.75);
    expect(strong.confidence.label).toBe("medium");
    // Confidence now carries discriminating information: strong markedly beats weak.
    expect(strong.confidence.score).toBeGreaterThan(weak.confidence.score + 0.2);
    // The review gap is still surfaced honestly — as a non-capping partial source.
    expect(
      strong.caveats.some((c) => c.kind === "partial_source" && c.sourceType === "review"),
    ).toBe(true);
    expect(strong.caveats.some((c) => c.kind === "estimated_metric")).toBe(true);
    // Structural consequence of relabelling the review gap missing_source→partial_source
    // to un-pin confidence: with no missing_source, deriveStatus returns "ok". This is
    // the honest-data governance point flagged to the coordinator (#246); if a
    // dimension-aware cap is authorized to restore "partial", update this expectation.
    expect(strong.status).toBe("ok");
  });

  it("#246: multi-word incoherent input degrades to not_enough_data, never has_room", () => {
    // Keywords parse fine, but the surfaced apps are scattered incidental-token hits
    // across unrelated categories — no resolved category, no head-on competitor, no
    // shared-category cluster. This must NOT read as a green-light market.
    // Modelled as real retrieval emits them: an FTS token-hit is `adjacent`
    // (ftsScore>=0.2), NOT `analogue` — but its blended similarityScore stays low
    // (single signal). The gate must sink these on SCORE, not class (#246 re-review).
    const scattered: SimilarApp[] = [
      competitor({ similarityClass: "adjacent", similarityScore: 0.26 }, { id: "n_1", title: "Sandwich Recipes", reviewCount: 8000, category: "Food & Drink", rating: 4.2, growthScore: 20 }),
      competitor({ similarityClass: "adjacent", similarityScore: 0.20 }, { id: "n_2", storeAppId: "902", title: "Moon Phase", reviewCount: 6000, category: "Weather", rating: 4.0, growthScore: 15 }),
      competitor({ similarityClass: "adjacent", similarityScore: 0.16 }, { id: "n_3", storeAppId: "903", title: "Blockchain Wallet", reviewCount: 12000, category: "Finance", rating: 3.8, growthScore: 30 }),
    ];
    const result = buildValidateIdeaResponse({
      idea: "blockchain-powered app for teleporting sentient sandwiches to the moon",
      interpreted: interpreted({
        summary: "a nonsensical multi-domain idea",
        keywords: ["blockchain", "teleporting", "sandwiches", "moon"],
        categories: [], // interpreter resolved no real category
      }),
      competitors: scattered,
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea: "teleporting sandwiches" },
    });

    expect(["not_enough_data", "unvalidated"]).toContain(result.data.verdict);
    expect(result.data.verdict).not.toBe("has_room");
    expect(result.data.verdict).not.toBe("strong_opportunity");
    expect(result.confidence.score).toBeLessThanOrEqual(0.3);
    expect(result.confidence.label).toBe("low");
    // Honest labelling intact: the incoherence is stated, estimates still flagged.
    expect(result.caveats.some((c) => c.kind === "weak_evidence" && c.message.includes("cohere"))).toBe(true);
    expect(result.caveats.some((c) => c.kind === "estimated_metric")).toBe(true);
  });

  it("#246: does NOT sink a real cross-domain niche whose competitors span categories", () => {
    // Regression guard for the coherence gate over-correcting (#246 review): a
    // plausible idea with no App-Store facet word (categories=[]) whose genuine
    // competitors naturally split across Finance/Music/Business must NOT be forced
    // to not_enough_data. The category-independent strong-match escape saves it.
    // Genuine matches: each clears STRONG_SIMILARITY (0.4) — a real multi-signal
    // match scores well above the single-token incidental blend, even split across
    // Finance/Music/Business with no shared store category.
    const crossDomain: SimilarApp[] = [
      competitor({ similarityClass: "adjacent", similarityScore: 0.46 }, { id: "m_1", title: "Freelance Budget", reviewCount: 6000, category: "Finance", rating: 4.3, growthScore: 40 }),
      competitor({ similarityClass: "adjacent", similarityScore: 0.44 }, { id: "m_2", storeAppId: "802", title: "Gig Money Manager", reviewCount: 5200, category: "Business", rating: 4.1, growthScore: 38 }),
      competitor({ similarityClass: "adjacent", similarityScore: 0.42 }, { id: "m_3", storeAppId: "803", title: "Musician Income Tracker", reviewCount: 4800, category: "Music", rating: 4.0, growthScore: 35 }),
    ];
    const result = buildValidateIdeaResponse({
      idea: "a budgeting tool for freelance musicians",
      interpreted: interpreted({
        summary: "a budgeting tool for freelance musicians",
        keywords: ["budgeting", "freelance", "musicians"],
        categories: [], // no single store category the interpreter could resolve
      }),
      competitors: crossDomain,
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea: "budgeting freelance musicians" },
    });

    // A real market: not the low-information sink.
    expect(result.data.verdict).not.toBe("not_enough_data");
    expect(result.data.verdict).not.toBe("unvalidated");
    // Confidence is graded from real signal, not floored to the incoherent sink (0.3).
    expect(result.confidence.score).toBeGreaterThan(0.3);
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

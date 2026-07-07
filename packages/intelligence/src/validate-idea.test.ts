import { describe, expect, it } from "vitest";
import type { AppListItem, InterpretedIdea, SimilarApp } from "@kittie/types";
import { buildValidateIdeaResponse, ValidateIdeaInputError } from "./validate-idea.js";
import {
  inferCategories,
  interpretFromQuery,
  rankSimilar,
  type SimilarCandidate,
} from "./similarity/index.js";

const generatedAt = "2026-07-02T12:00:00.000Z";

/** Representative store-category facet list, as `listCategoryFacetsFromDb` returns. */
const FACETS = [
  "Business",
  "Education",
  "Entertainment",
  "Finance",
  "Food & Drink",
  "Games",
  "Health & Fitness",
  "Lifestyle",
  "Music",
  "Productivity",
  "Utilities",
  "Weather",
];

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

/**
 * Run an idea + retrieval hits through the REAL pipeline, exactly as
 * `findSimilarApps` orchestrates it: real `interpretFromQuery` (pre-injection
 * interpretation), real `inferCategories` (modal-FTS-hit category injection),
 * real `rankSimilar`/`scoreSimilar` under the post-injection interpretation.
 * Only the DB retrieval itself is replaced by fixture hits — no hand-built
 * interpreted objects, no hand-set scores/classes. Hand-built fixtures bypassing
 * this path were the root cause of three false-green review rounds (#246 ruling).
 */
function runPipeline(
  idea: string,
  hits: Array<{ app: AppListItem; ftsScore: number }>,
): {
  preInjection: InterpretedIdea;
  interpreted: InterpretedIdea;
  competitors: SimilarApp[];
} {
  const preInjection = interpretFromQuery(idea, FACETS);
  const itemById = new Map(hits.map((h) => [h.app.id, h.app]));
  const fts = new Map(hits.map((h) => [h.app.id, h.ftsScore]));
  const ftsScoreOf = (id: string): number => fts.get(id) ?? 0;

  let interpreted = preInjection;
  if (interpreted.categories.length === 0) {
    const inferred = inferCategories([...itemById.keys()], ftsScoreOf, itemById);
    if (inferred.length) interpreted = { ...interpreted, categories: inferred };
  }

  const candidates: SimilarCandidate[] = hits.map((h) => ({
    app: h.app,
    ftsScore: h.ftsScore,
    categoryPeer: false,
    reviewTopicScore: 0,
  }));
  const competitors = rankSimilar(candidates, interpreted, 20);
  return { preInjection, interpreted, competitors };
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
      // Resolved category → coherent, so this isolates the THIN-evidence path (not the
      // coherence gate): a categorised but under-reviewed niche degrades on thin data.
      interpreted: interpreted({ summary: "a bottle cap collecting app", keywords: ["bottle", "caps"], categories: ["Lifestyle"] }),
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

  it("#246 canonical: sandwich nonsense through the REAL pipeline (inferCategories injects Finance) → not_enough_data, never has_room", () => {
    const idea = "blockchain-powered app for teleporting sentient sandwiches to the moon";
    // Incidental FTS hits exactly as production retrieval surfaces them: "blockchain"
    // pulls two unrelated Finance apps (a real >=2 modal cluster), the other tokens pull
    // scattered singletons. Per-term ftsScores are IDF-share-realistic (a 6-term idea
    // gives each term ~0.1-0.2 of the normalised weight — a single-token hit cannot
    // approach 1.0 here).
    const hits = [
      { app: appItem({ id: "n_1", title: "Blockchain Wallet", category: "Finance", reviewCount: 12000, rating: 3.8, growthScore: 30 }), ftsScore: 0.2 },
      { app: appItem({ id: "n_2", storeAppId: "902", title: "Blockchain Ledger Pro", category: "Finance", reviewCount: 9000, rating: 4.1, growthScore: 25 }), ftsScore: 0.18 },
      { app: appItem({ id: "n_3", storeAppId: "903", title: "Gourmet Sandwiches", category: "Food & Drink", reviewCount: 8000, rating: 4.2, growthScore: 20 }), ftsScore: 0.15 },
      { app: appItem({ id: "n_4", storeAppId: "904", title: "Moon Phase", category: "Weather", reviewCount: 6000, rating: 4.0, growthScore: 15 }), ftsScore: 0.12 },
    ];
    const { preInjection, interpreted: injected, competitors } = runPipeline(idea, hits);

    // The REAL interpreter resolves no category from the idea itself (parseable, not ambiguous).
    expect(preInjection.categories).toEqual([]);
    expect(preInjection.keywords.length).toBeGreaterThan(0);
    // The REAL injection fires: >=2 incidental Finance hits → ['Finance'] injected. This
    // is the exact poison that re-opened the P0 three times — the test now goes through it.
    expect(injected.categories).toEqual(["Finance"]);
    expect(competitors.length).toBeGreaterThan(0);

    const result = buildValidateIdeaResponse({
      idea,
      interpreted: injected,
      statedCategories: preInjection.categories,
      competitors,
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea },
    });

    // The gate reads the PRE-injection interpretation → the nonsense is sunk.
    expect(result.data.verdict).toBe("not_enough_data");
    expect(result.data.verdict).not.toBe("has_room");
    expect(result.confidence.score).toBeLessThanOrEqual(0.3);
    expect(result.confidence.label).toBe("low");
    // Honest labelling intact: the incoherence is stated, estimates still flagged.
    expect(result.caveats.some((c) => c.kind === "weak_evidence" && c.message.includes("cohere"))).toBe(true);
    expect(result.caveats.some((c) => c.kind === "estimated_metric")).toBe(true);

    // Potency check: this fixture genuinely reproduces the P0 when the gate reads the
    // POST-injection interpretation (the pre-fix behaviour) — so this test cannot
    // false-green if the pre-injection plumbing is ever dropped.
    const regressed = buildValidateIdeaResponse({
      idea,
      interpreted: injected, // statedCategories omitted → falls back to injected categories
      competitors,
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea },
    });
    expect(regressed.data.verdict).toBe("has_room");
  });

  it("#246: injected category also poisons `direct` classification — the gate ignores post-injection directs too", () => {
    // A near-single-token idea gives the surviving term ~all of the IDF weight, so a
    // rare-token hit's ftsScore CAN reach `strong` (>=0.5). Once inferCategories
    // injects Finance, that same incidental hit becomes sameCategory + strong → the
    // scorer classifies it `direct`. The second poisoned clause: directCount>0 must
    // not make an idea coherent when the category behind it was injected.
    const idea = "a blockchain app";
    const hits = [
      { app: appItem({ id: "d_1", title: "Blockchain Wallet", category: "Finance", reviewCount: 12000, rating: 3.8, growthScore: 30 }), ftsScore: 1 },
      { app: appItem({ id: "d_2", storeAppId: "912", title: "Blockchain Ledger Pro", category: "Finance", reviewCount: 9000, rating: 4.1, growthScore: 25 }), ftsScore: 0.8 },
    ];
    const { preInjection, interpreted: injected, competitors } = runPipeline(idea, hits);

    expect(preInjection.categories).toEqual([]);
    expect(injected.categories).toEqual(["Finance"]);
    // The poison is live: the REAL scorer emits `direct` under the injected category.
    expect(competitors.some((c) => c.similarityClass === "direct")).toBe(true);

    const result = buildValidateIdeaResponse({
      idea,
      interpreted: injected,
      statedCategories: preInjection.categories,
      competitors,
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea },
    });

    // Pre-injection there is no resolved category and no trustable direct → sunk.
    expect(result.data.verdict).toBe("not_enough_data");
    expect(result.confidence.score).toBeLessThanOrEqual(0.3);
  });

  it("#246: a category the idea ITSELF resolves makes it coherent (real pipeline, no injection) → real verdict", () => {
    // The other side of the gate: the query contains a category facet word, so the REAL
    // interpreter resolves it pre-injection (inferCategories never runs — categories are
    // non-empty). Competitors are same-category but sub-`strong` fts → the real scorer
    // emits `adjacent`, directCount=0 — the stated category alone carries coherence.
    const idea = "a fitness coaching app to help people stay sober";
    const hits = [
      { app: appItem({ id: "c_1", title: "Quit Coaching", category: "Health & Fitness", reviewCount: 9000, rating: 4.3, growthScore: 40 }), ftsScore: 0.3 },
      { app: appItem({ id: "c_2", storeAppId: "812", title: "Sober Days", category: "Health & Fitness", reviewCount: 7000, rating: 4.1, growthScore: 35 }), ftsScore: 0.25 },
    ];
    const { preInjection, interpreted: interp, competitors } = runPipeline(idea, hits);

    // Resolved from the idea itself — pre-injection and post-injection agree.
    expect(preInjection.categories).toEqual(["Health & Fitness"]);
    expect(interp.categories).toEqual(["Health & Fitness"]);
    expect(competitors.every((c) => c.similarityClass === "adjacent")).toBe(true);

    const result = buildValidateIdeaResponse({
      idea,
      interpreted: interp,
      statedCategories: preInjection.categories,
      competitors,
      reviewThemes: [],
      generatedAt,
      sourceQuery: { idea },
    });

    // Coherent via the stated category → a real verdict, not the low-information sink.
    expect(result.data.verdict).not.toBe("not_enough_data");
    expect(result.data.verdict).not.toBe("unvalidated");
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

import { describe, expect, it, vi } from "vitest";
import type { AppListItem, FindSimilarAppsResult, SimilarApp } from "@kittie/types";
import {
  getValidateIdeaIntelligence,
  ValidateIdeaIntelligenceError,
} from "./validate-idea-intelligence-service.js";

const now = () => new Date("2026-07-02T12:00:00.000Z");

function appItem(overrides: Partial<AppListItem> = {}): AppListItem {
  return {
    id: "app_1",
    store: "apple",
    storeAppId: "123",
    title: "Sober Coach",
    iconUrl: null,
    developer: "Dev",
    category: "Health & Fitness",
    rating: 4.6,
    reviewCount: 12000,
    reviewGrowth7d: null,
    downloadsEstimate30d: null,
    revenueEstimate30d: null,
    growthScore: 70,
    growthPct: null,
    downloadsEstimatePrior: null,
    revenueEstimatePrior: null,
    rankDelta: null,
    isFirstMover: false,
    releasedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function similarResult(similar: SimilarApp[], missing: string[] = []): FindSimilarAppsResult {
  return {
    interpretedQuery: {
      summary: "a sobriety coaching app",
      categories: ["Health & Fitness"],
      keywords: ["sobriety", "coach"],
      kind: "inferred",
    },
    similar,
    confidence: { score: 0.7, reasons: ["hits"] },
    missing,
    agentSummary: "summary",
  };
}

function competitor(overrides: Partial<AppListItem> = {}): SimilarApp {
  return {
    app: appItem(overrides),
    similarityScore: 0.8,
    similarityClass: "direct",
    similarityReasons: ["keyword overlap"],
    matchedVia: ["fts_keyword"],
  };
}

describe("validate-idea intelligence service", () => {
  it("composes find_similar_apps + review themes into the envelope", async () => {
    const findSimilarApps = vi.fn().mockResolvedValue(
      similarResult([competitor(), competitor({ id: "app_2", storeAppId: "456", title: "Quit Buddy" })]),
    );
    const mineReviewThemes = vi.fn().mockResolvedValue(["pricing complaints"]);

    const result = await getValidateIdeaIntelligence(
      { idea: "an app to help people stay sober", store: "apple" },
      { findSimilarApps, mineReviewThemes, now },
    );

    expect(findSimilarApps).toHaveBeenCalledWith({
      query: "an app to help people stay sober",
      store: "apple",
      limit: undefined,
    });
    expect(result.responseType).toBe("idea_validation");
    expect(result.data.competitors).toHaveLength(2);
    expect(result.data.opportunities.some((o) => o.message.includes("pricing complaints"))).toBe(true);
    expect(result.metadata.sourceQuery).toEqual({
      idea: "an app to help people stay sober",
      store: "apple",
      limit: null,
    });
  });

  it("wires evidenceThin through: weak competitor evidence yields not_enough_data + partial", async () => {
    const findSimilarApps = vi.fn().mockResolvedValue(
      similarResult([
        competitor({ id: "app_1", reviewCount: 12, rating: null, growthScore: null }),
        competitor({ id: "app_2", storeAppId: "456", title: "Tiny App", reviewCount: 9 }),
      ]),
    );
    const mineReviewThemes = vi.fn().mockResolvedValue([]);

    const result = await getValidateIdeaIntelligence(
      { idea: "a niche bottle cap collecting app" },
      { findSimilarApps, mineReviewThemes, now },
    );

    expect(result.data.verdict).toBe("not_enough_data");
    expect(result.status).toBe("partial");
    expect(result.confidence.label).toBe("low");
    expect(result.caveats.some((c) => c.kind === "weak_evidence")).toBe(true);
  });

  it("wires the ambiguous flag through: no parsed keywords caps the verdict", async () => {
    const findSimilarApps = vi.fn().mockResolvedValue({
      ...similarResult([competitor({ reviewCount: 50000, rating: 4.8, growthScore: 80 })]),
      interpretedQuery: {
        summary: "something for everyone",
        categories: [],
        keywords: [],
        kind: "inferred" as const,
      },
      missing: ["no usable keywords parsed from the idea"],
    });
    const mineReviewThemes = vi.fn().mockResolvedValue(["pricing complaints"]);

    const result = await getValidateIdeaIntelligence(
      { idea: "something for everyone" },
      { findSimilarApps, mineReviewThemes, now },
    );

    expect(result.data.verdict).toBe("not_enough_data");
    expect(result.confidence.score).toBeLessThanOrEqual(0.3);
    expect(result.caveats.some((c) => c.message.includes("ambiguous"))).toBe(true);
  });

  it("#246: plumbs pre-injection statedCategories through — an inferCategories-injected category never makes nonsense coherent", async () => {
    // What production `findSimilarApps` emits for the canonical nonsense idea: the
    // query itself resolved NO category (statedCategories: []), but inferCategories
    // injected the modal Finance cluster of the incidental FTS hits into
    // interpretedQuery — under which one strong-fts hit even classified `direct`.
    // The coherence gate must read the PRE-injection state and sink it.
    const findSimilarApps = vi.fn().mockResolvedValue({
      ...similarResult([
        competitor({ id: "n_1", title: "Blockchain Wallet", category: "Finance", rating: 3.8 }),
        { ...competitor({ id: "n_2", storeAppId: "902", title: "Blockchain Ledger Pro", category: "Finance" }), similarityClass: "adjacent" as const, similarityScore: 0.39 },
      ]),
      interpretedQuery: {
        summary: "blockchain-powered app for teleporting sentient sandwiches to the moon",
        categories: ["Finance"], // injected by inferCategories, NOT resolved from the idea
        keywords: ["blockchain", "powered", "teleporting", "sentient", "sandwiches", "moon"],
        kind: "inferred" as const,
      },
      statedCategories: [],
    });
    const mineReviewThemes = vi.fn().mockResolvedValue([]);

    const result = await getValidateIdeaIntelligence(
      { idea: "blockchain-powered app for teleporting sentient sandwiches to the moon" },
      { findSimilarApps, mineReviewThemes, now },
    );

    expect(result.data.verdict).toBe("not_enough_data");
    expect(result.data.verdict).not.toBe("has_room");
    expect(result.confidence.score).toBeLessThanOrEqual(0.3);
    expect(result.caveats.some((c) => c.message.includes("cohere"))).toBe(true);
  });

  it("returns an honest insufficient envelope when the catalog has no competitors", async () => {
    const findSimilarApps = vi.fn().mockResolvedValue(similarResult([], ["no FTS hits"]));
    const mineReviewThemes = vi.fn().mockResolvedValue([]);

    const result = await getValidateIdeaIntelligence(
      { idea: "whale song translator" },
      { findSimilarApps, mineReviewThemes, now },
    );

    expect(result.data.verdict).toBe("unvalidated");
    expect(result.status).toBe("insufficient");
    expect(result.confidence.label).toBe("insufficient");
  });

  it("rejects a missing or blank idea", async () => {
    const deps = {
      findSimilarApps: vi.fn(),
      mineReviewThemes: vi.fn(),
      now,
    };
    await expect(getValidateIdeaIntelligence({ idea: "   " }, deps)).rejects.toThrow(
      ValidateIdeaIntelligenceError,
    );
    expect(deps.findSimilarApps).not.toHaveBeenCalled();
  });

  it("rejects an invalid store", async () => {
    const deps = {
      findSimilarApps: vi.fn(),
      mineReviewThemes: vi.fn(),
      now,
    };
    await expect(
      getValidateIdeaIntelligence(
        { idea: "sober coach", store: "amazon" as unknown as "apple" },
        deps,
      ),
    ).rejects.toThrow(ValidateIdeaIntelligenceError);
  });
});

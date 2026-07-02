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

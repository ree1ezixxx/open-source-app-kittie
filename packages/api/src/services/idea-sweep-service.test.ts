import { describe, expect, it } from "vitest";
import type { StaleIdeaCandidate } from "@kittie/db";

import { BLUEPRINT_SCHEMA_VERSION } from "./idea-blueprint.js";
import { selectStaleForUpgrade } from "./idea-sweep-service.js";

const building = {
  difficulty: "medium",
  difficultyReasoning: "x",
  timelineWeeks: 5,
  requirements: ["a"],
  mvpFeatures: ["a"],
  keyFeatures: ["a"],
  v2Features: ["a"],
  architecture: "x",
  techStack: ["a"],
  mvpScope: "x",
  thirdPartyServices: ["a"],
};
const section = (n: string) =>
  Object.fromEntries(
    [
      "summary",
      "whyThisApp",
      "marketSizeInsight",
      "targetAudience",
      "monetizationStrategy",
      "marketingStrategy",
      "goToMarket",
    ].map((k) => [k, `${n}-${k}`]),
  );
const arrays = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, [`${k}-1`]]));

const LEGACY_V1 = JSON.stringify(building); // no schemaVersion, no opportunity/marketing
const FRESH_V2 = JSON.stringify({
  ...building,
  schemaVersion: BLUEPRINT_SCHEMA_VERSION,
  opportunity: {
    ...section("o"),
    ...arrays(["painPoints", "featureGaps", "competitiveAdvantages"]),
  },
  marketing: {
    ...section("m"),
    ...arrays([
      "marketingPlatforms",
      "contentHooks",
      "ugcFormats",
      "campaignIdeas",
      "creatorTypes",
      "keySellingPoints",
      "asoKeywords",
    ]),
  },
});

const cand = (ideaId: string, blueprint: string): StaleIdeaCandidate => ({
  appId: `app-${ideaId}`,
  storeAppId: ideaId,
  store: "apple",
  title: `T${ideaId}`,
  category: "Photo & Video",
  description: null,
  price: null,
  releasedAt: null,
  reviewCount: 100,
  rating: 4,
  downloadsEstimate: null,
  revenueEstimate: null,
  growthScore: null,
  chartRank: null,
  ideaId,
  blueprint,
});

describe("selectStaleForUpgrade", () => {
  it("selects only legacy (pre-v2) ideas, skipping fresh ones", () => {
    const picked = selectStaleForUpgrade(
      [cand("1", LEGACY_V1), cand("2", FRESH_V2), cand("3", LEGACY_V1)],
      10,
    );
    expect(picked.map((c) => c.ideaId)).toEqual(["1", "3"]);
  });

  it("respects the per-run cap (oldest-stale order preserved)", () => {
    const picked = selectStaleForUpgrade(
      [cand("1", LEGACY_V1), cand("2", LEGACY_V1), cand("3", LEGACY_V1)],
      2,
    );
    expect(picked.map((c) => c.ideaId)).toEqual(["1", "2"]);
  });

  it("returns nothing when every idea is already fresh", () => {
    expect(selectStaleForUpgrade([cand("1", FRESH_V2), cand("2", FRESH_V2)], 10)).toEqual([]);
  });

  it("treats a v2-stamped-but-malformed blueprint as stale (needs re-gen)", () => {
    const halfBaked = JSON.stringify({ ...building, schemaVersion: 2, opportunity: { summary: "x" } });
    expect(selectStaleForUpgrade([cand("1", halfBaked)], 10).map((c) => c.ideaId)).toEqual(["1"]);
  });

  it("handles a zero/negative cap", () => {
    expect(selectStaleForUpgrade([cand("1", LEGACY_V1)], 0)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  BLUEPRINT_SCHEMA_VERSION,
  isBlueprintFresh,
  normalizeBlueprint,
  parseMarketing,
  parseOpportunity,
} from "./idea-blueprint.js";

const fullOpportunity = {
  summary: "A big opportunity.",
  whyThisApp: "Because demand is proven.",
  marketSizeInsight: "Large and growing.",
  painPoints: ["slow", "expensive"],
  featureGaps: ["no offline mode"],
  targetAudience: "Indie creators.",
  monetizationStrategy: "Subscription.",
  competitiveAdvantages: ["faster", "cheaper"],
};

const fullMarketing = {
  marketingStrategy: "Community-led growth.",
  marketingPlatforms: ["TikTok", "Reddit"],
  contentHooks: ["before/after"],
  ugcFormats: ["screen recordings"],
  campaignIdeas: ["launch week"],
  creatorTypes: ["productivity YouTubers"],
  keySellingPoints: ["one-tap export"],
  asoKeywords: ["video editor", "ai art"],
  goToMarket: "Seed with 10 creators, then paid.",
};

// A v1 (legacy) blueprint: building fields at the top level, no schemaVersion,
// no opportunity/marketing — exactly what the 152 pre-existing ideas hold.
const legacyV1 = {
  difficulty: "medium",
  difficultyReasoning: "moderate scope",
  timelineWeeks: 5,
  requirements: ["camera access"],
  mvpFeatures: ["upload", "render"],
  keyFeatures: ["templates"],
  v2Features: ["collab"],
  architecture: "client + serverless",
  techStack: ["expo", "supabase"],
  mvpScope: "single-flow MVP",
  thirdPartyServices: ["replicate"],
};

describe("parseOpportunity", () => {
  it("returns a typed object when every field is well-formed", () => {
    expect(parseOpportunity(fullOpportunity)).toEqual(fullOpportunity);
  });

  it("returns null when a required field is missing", () => {
    const { painPoints, ...missing } = fullOpportunity;
    void painPoints;
    expect(parseOpportunity(missing)).toBeNull();
  });

  it("returns null on empty arrays / blank strings / non-objects", () => {
    expect(parseOpportunity({ ...fullOpportunity, painPoints: [] })).toBeNull();
    expect(parseOpportunity({ ...fullOpportunity, summary: "  " })).toBeNull();
    expect(parseOpportunity(null)).toBeNull();
    expect(parseOpportunity("nope")).toBeNull();
  });

  it("returns null on an array with no usable strings (write/read parity)", () => {
    // Must reject here too — else write accepts it but the read-side re-parse rejects,
    // looping the idea as 'stale' forever.
    expect(parseOpportunity({ ...fullOpportunity, painPoints: [1, null, {}] })).toBeNull();
  });

  it("drops non-string array entries", () => {
    const r = parseOpportunity({ ...fullOpportunity, painPoints: ["ok", 5, null, "fine"] });
    expect(r?.painPoints).toEqual(["ok", "fine"]);
  });
});

describe("parseMarketing", () => {
  it("returns a typed object when well-formed", () => {
    expect(parseMarketing(fullMarketing)).toEqual(fullMarketing);
  });

  it("returns null when a required field is missing", () => {
    const { goToMarket, ...missing } = fullMarketing;
    void goToMarket;
    expect(parseMarketing(missing)).toBeNull();
  });
});

describe("normalizeBlueprint", () => {
  it("reads a legacy v1 blob: building present, opportunity/marketing null, version 1", () => {
    const doc = normalizeBlueprint(legacyV1);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.mvpFeatures).toEqual(["upload", "render"]);
    expect(doc.timelineWeeks).toBe(5);
    expect(doc.opportunity).toBeNull();
    expect(doc.marketing).toBeNull();
  });

  it("reads a v2 blob with both sections", () => {
    const doc = normalizeBlueprint({
      ...legacyV1,
      schemaVersion: 2,
      opportunity: fullOpportunity,
      marketing: fullMarketing,
    });
    expect(doc.schemaVersion).toBe(2);
    expect(doc.opportunity).toEqual(fullOpportunity);
    expect(doc.marketing).toEqual(fullMarketing);
  });

  it("accepts a JSON string and parses it", () => {
    const doc = normalizeBlueprint(JSON.stringify(legacyV1));
    expect(doc.mvpFeatures).toEqual(["upload", "render"]);
  });

  it("never throws on junk — returns an empty building doc", () => {
    expect(normalizeBlueprint("{not json").schemaVersion).toBe(1);
    expect(normalizeBlueprint(null).mvpFeatures).toEqual([]);
    expect(normalizeBlueprint(42).architecture).toBe("");
  });

  it("treats a present-but-malformed opportunity as null (building survives)", () => {
    const doc = normalizeBlueprint({ ...legacyV1, schemaVersion: 2, opportunity: { summary: "x" } });
    expect(doc.opportunity).toBeNull();
    expect(doc.mvpFeatures).toEqual(["upload", "render"]);
  });
});

describe("isBlueprintFresh", () => {
  it("is false for legacy v1", () => {
    expect(isBlueprintFresh(normalizeBlueprint(legacyV1))).toBe(false);
  });

  it("is false when version is current but a section is missing", () => {
    const doc = normalizeBlueprint({ ...legacyV1, schemaVersion: BLUEPRINT_SCHEMA_VERSION, opportunity: fullOpportunity });
    expect(doc.marketing).toBeNull();
    expect(isBlueprintFresh(doc)).toBe(false);
  });

  it("is true for a complete current-version blueprint", () => {
    const doc = normalizeBlueprint({
      ...legacyV1,
      schemaVersion: BLUEPRINT_SCHEMA_VERSION,
      opportunity: fullOpportunity,
      marketing: fullMarketing,
    });
    expect(isBlueprintFresh(doc)).toBe(true);
  });
});

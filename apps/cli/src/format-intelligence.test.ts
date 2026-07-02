import { describe, expect, it } from "vitest";
import type {
  AppDetailIntelligenceResponse,
  CompareAppsIntelligenceResponse,
  ValidateIdeaIntelligenceResponse,
} from "@kittie/types";
import {
  formatAppIntelligence,
  formatCompare,
  formatTrending,
  formatValidate,
} from "./format-intelligence.js";
import type { TrendsIntelligenceResponse } from "./intelligence-client.js";

// Partial fixtures cast to the contract types — the formatters only read these
// fields, and format-intelligence.ts already typechecks against the full types.
const appRes = {
  responseType: "app_detail",
  status: "ok",
  data: {
    app: { store: "apple", storeAppId: "6446901002", title: "Focus Timer", developer: "Deep Work Labs", category: "Productivity" },
    observed: { rating: 4.8, reviewCount: 18420, chartRank: 12 },
    estimated: { downloads30d: 41000, revenue30dUsd: 76000, growthScore: 78, growthPct: 22, isFirstMover: true },
  },
  confidence: { score: 0.78, label: "medium", reasons: [] },
  caveats: [{ kind: "estimated_metric", message: "Revenue is modelled." }],
} as unknown as AppDetailIntelligenceResponse;

const trendsRes = {
  responseType: "trends",
  status: "partial",
  data: {
    category: "Productivity",
    country: "US",
    growthPeriod: "7d",
    apps: [
      { rank: 1, title: "Focus Timer", developer: "Deep Work Labs", movement: { reviewGrowthPct: 18, rankDelta: 4, growthScore: 78 } },
    ],
  },
  confidence: { score: 0.52, label: "low", reasons: [] },
  caveats: [],
} as unknown as TrendsIntelligenceResponse;

const compareRes = {
  responseType: "compare_apps",
  status: "ok",
  data: {
    dimensions: [{ key: "rating", label: "Rating", valueType: "number", unit: null, higherIsBetter: true }],
    rows: [
      { title: "Focus Timer", values: { rating: 4.8 } },
      { title: "Deep Focus", values: { rating: 4.6 } },
    ],
    insights: [{ kind: "leader", message: "Focus Timer leads on rating.", evidenceIds: [] }],
  },
  confidence: { score: 0.6, label: "medium", reasons: [] },
  caveats: [],
} as unknown as CompareAppsIntelligenceResponse;

const validateRes = {
  responseType: "idea_validation",
  status: "partial",
  data: {
    idea: "a focus timer for students",
    verdict: "has_room",
    verdictReason: "Has room: differentiate on exam-week planning.",
    likelyCategory: "Productivity",
    competitors: [{ title: "Focus Timer" }, { title: "Deep Focus" }],
    risks: [{ message: "Crowded category", evidenceIds: [] }],
    opportunities: [{ message: "Complaints about sync bugs", evidenceIds: [] }],
  },
  evidence: [{}, {}],
  confidence: { score: 0.59, label: "low", reasons: [] },
  caveats: [],
} as unknown as ValidateIdeaIntelligenceResponse;

describe("formatAppIntelligence", () => {
  it("shows app facts, estimates, confidence, and caveats", () => {
    const out = formatAppIntelligence(appRes);
    expect(out).toContain("Focus Timer (apple:6446901002)");
    expect(out).toContain("18,420 reviews");
    expect(out).toContain("$76.0K");
    expect(out).toContain("FIRST MOVER");
    expect(out).toContain("Confidence: medium (0.78)");
    expect(out).toContain("estimated_metric");
  });
});

describe("formatTrending", () => {
  it("renders a ranked table with the header line", () => {
    const out = formatTrending(trendsRes);
    expect(out).toContain("Trending — Productivity · US · 7d");
    expect(out).toContain("Focus Timer");
    expect(out).toContain("Growth%");
  });

  it("shows an honest empty state", () => {
    const empty = { ...trendsRes, data: { ...trendsRes.data, apps: [] } } as TrendsIntelligenceResponse;
    expect(formatTrending(empty)).toContain("No trending apps");
  });
});

describe("formatCompare", () => {
  it("renders the dimension table and insights", () => {
    const out = formatCompare(compareRes);
    expect(out).toContain("Focus Timer");
    expect(out).toContain("Deep Focus");
    expect(out).toContain("Rating");
    expect(out).toContain("[leader]");
  });
});

describe("formatValidate", () => {
  it("shows verdict, confidence, evidence count, risks, opportunities, and reason", () => {
    const out = formatValidate(validateRes);
    expect(out).toContain("Verdict: has_room");
    expect(out).toContain("Confidence: 0.59 (low)");
    expect(out).toContain("Likely category: Productivity");
    expect(out).toContain("Competitors: 2 — top: Focus Timer, Deep Focus");
    expect(out).toContain("Evidence: 2 item(s)");
    expect(out).toContain("Crowded category");
    expect(out).toContain("Complaints about sync bugs");
    expect(out).toContain("differentiate on exam-week planning");
  });
});

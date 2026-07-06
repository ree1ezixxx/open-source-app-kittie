import { describe, expect, it } from "vitest";
import { CONFIDENCE_MODEL, calibrateConfidence, isLocaleMismatch, type CalibrationInput } from "./index.js";

const base = (over: Partial<CalibrationInput> = {}): CalibrationInput => ({
  evidenceUnits: 100,
  evidenceTarget: 100,
  appsContributing: 8,
  appsResolved: 10,
  recentFraction: 0.6,
  sourceTypesPresent: 1,
  sourceTypesConsulted: 1,
  llmEnriched: false,
  requestedLocale: "US",
  localesSeen: ["US"],
  ...over,
});

describe("calibrateConfidence — worked examples (docs/contracts/confidence-calibration.md)", () => {
  it("example 1: rich single-market cluster → 0.89 high", () => {
    const c = calibrateConfidence(base());
    expect(c.score).toBe(0.89);
    expect(c.label).toBe("high");
  });

  it("example 2: thin corpus → 0.45 low", () => {
    const c = calibrateConfidence(base({ evidenceUnits: 10, appsContributing: 1, recentFraction: null }));
    expect(c.score).toBe(0.45);
    expect(c.label).toBe("low");
  });

  it("example 3: locale mismatch demotes by 0.10 → 0.79 high", () => {
    const c = calibrateConfidence(base({ requestedLocale: "GB" }));
    expect(c.score).toBe(0.79);
    expect(c.reasons.some((r) => r.includes("locale mismatch"))).toBe(true);
  });

  it("example 4: zero evidence → 0 insufficient, always", () => {
    const c = calibrateConfidence(base({ evidenceUnits: 0, llmEnriched: true }));
    expect(c).toMatchObject({ score: 0, label: "insufficient" });
  });

  it("example 5: LLM lift is +0.05, cannot rescue thin evidence into medium", () => {
    const c = calibrateConfidence(base({ evidenceUnits: 10, appsContributing: 1, recentFraction: null, llmEnriched: true }));
    expect(c.score).toBe(0.5);
    expect(c.label).toBe("low");
  });

  it("ceiling 0.9 holds even with everything maxed", () => {
    const c = calibrateConfidence(base({ recentFraction: 1, llmEnriched: true, sourceTypesPresent: 1, appsContributing: 10 }));
    expect(c.score).toBeLessThanOrEqual(CONFIDENCE_MODEL.ceiling);
  });
});

describe("calibrateConfidence — hard rules (property-style)", () => {
  const units = [1, 5, 20, 50, 100, 500];
  it("more evidence never lowers the score (monotone in volume)", () => {
    let prev = -1;
    for (const u of units) {
      const s = calibrateConfidence(base({ evidenceUnits: u })).score;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("more corroborating apps never lowers the score (monotone in spread)", () => {
    let prev = -1;
    for (let apps = 0; apps <= 10; apps++) {
      const s = calibrateConfidence(base({ appsContributing: apps })).score;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("a locale mismatch never raises the score", () => {
    for (const u of units) {
      const match = calibrateConfidence(base({ evidenceUnits: u })).score;
      const mismatch = calibrateConfidence(base({ evidenceUnits: u, requestedLocale: "GB" })).score;
      expect(mismatch).toBeLessThanOrEqual(match);
    }
  });

  it("score is auditable: every non-zero factor named in reasons", () => {
    const c = calibrateConfidence(base({ llmEnriched: true }));
    for (const needle of ["volume", "spread", "recency", "source diversity", "LLM enrichment"]) {
      expect(c.reasons.some((r) => r.includes(needle)), needle).toBe(true);
    }
  });

  it("discarding old evidence never raises the score (recency scales with volume)", () => {
    // full corpus: 6 units, half recent — vs the same corpus capped to its 3 newest
    const full = calibrateConfidence(base({ evidenceUnits: 6, recentFraction: 0.5 }));
    const cappedToNewest = calibrateConfidence(base({ evidenceUnits: 3, recentFraction: 1 }));
    expect(cappedToNewest.score).toBeLessThanOrEqual(full.score);
  });

  it("floor 0.05 applies only when evidence exists", () => {
    const c = calibrateConfidence(base({ evidenceUnits: 1, evidenceTarget: 10000, appsContributing: 0, appsResolved: 100, recentFraction: 0, requestedLocale: "GB", localesSeen: ["US"] }));
    expect(c.score).toBeGreaterThanOrEqual(CONFIDENCE_MODEL.floor);
    expect(c.label).toBe("low");
  });
});

describe("isLocaleMismatch", () => {
  it("unknown locales never count as mismatch", () => {
    expect(isLocaleMismatch("US", [])).toBe(false);
    expect(isLocaleMismatch(null, ["US"])).toBe(false);
    expect(isLocaleMismatch("gb", ["GB"])).toBe(false);
    expect(isLocaleMismatch("GB", ["US"])).toBe(true);
  });
});

describe("auditability + envelope interaction (#273 rework)", () => {
  it("cluster response exposes recentFraction — score reproducible from sourceCoverage alone", async () => {
    const { clusterReviews } = await import("../review-clusters/index.js");
    const NOW = Date.parse("2026-07-06T00:00:00.000Z");
    const day = 86_400_000;
    const mk = (appId: string, daysAgo: number) => ({
      appId, country: "US", rating: 2, title: null, body: "too many ads in this thing",
      sentiment: "negative" as const, topics: ["Ads & Interruptions"], improvementAreas: [],
      reviewedAt: new Date(NOW - daysAgo * day).toISOString(),
    });
    const res = clusterReviews(
      { apps: [{ id: "apple:1", name: "A" }, { id: "apple:2", name: "B" }],
        reviews: [mk("apple:1", 10), mk("apple:1", 400), mk("apple:2", 20), mk("apple:2", 500)],
        params: { country: "US" }, nowMs: NOW },
      new Date(NOW).toISOString(),
    );
    const sc = res.data.sourceCoverage;
    expect(sc.recentFraction).toBe(0.5); // 2 of 4 within 180d — exposed, not hidden in reasons
    // Recompute from the response's OWN block: must equal the served score.
    const recomputed = calibrateConfidence({
      evidenceUnits: sc.reviewsAnalyzed,
      evidenceTarget: 100,
      appsContributing: sc.appsWithReviews,
      appsResolved: sc.appsResolved,
      recentFraction: sc.recentFraction,
      sourceTypesPresent: sc.notes.filter((n) => n.status !== "missing").length,
      sourceTypesConsulted: sc.notes.length,
      llmEnriched: res.data.enrichment === "llm",
      requestedLocale: res.data.country,
      localesSeen: sc.localesSeen,
    });
    expect(recomputed.score).toBe(res.confidence.score);
  });

  it("adding missing sources never raises envelope confidence (property)", async () => {
    const { buildIntelligenceResponse } = await import("../intelligence-response.js");
    const mkEnvelope = (missing: number) =>
      buildIntelligenceResponse({
        responseType: "review_clusters",
        data: {},
        evidence: [{ id: "e1", claim: "c", source: { type: "review", id: "r" as string, url: null }, valueKind: "derived" as const, sourceStatus: "ok" as const, freshness: "fresh" as const, observedAt: null, metric: null }],
        confidence: calibrateConfidence(base()),
        missingSources: Array.from({ length: missing }, (_, i) => ({ sourceType: "review" as const, message: `missing ${i}` })),
        metadata: { generatedAt: "2026-07-06T00:00:00.000Z", sourceQuery: {}, snapshotId: null, chartCountry: null, growthPeriod: null, modelVersion: null },
      }).confidence.score;
    let prev = Infinity;
    for (const n of [0, 1, 2, 3]) {
      const s = mkEnvelope(n);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
});

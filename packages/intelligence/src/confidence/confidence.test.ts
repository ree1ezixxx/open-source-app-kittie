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

import { describe, it, expect } from "vitest";
import { computeConfidence, type ConfidenceInput } from "./confidence.js";

function input(over: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    sourcesPresent: 2,
    sourcesExpected: 2,
    sampleSize: 500,
    freshness: "fresh",
    agreement: 0.8,
    ...over,
  };
}

describe("computeConfidence", () => {
  it("full coverage + large fresh sample + agreement → High", () => {
    const c = computeConfidence(input());
    expect(c.label).toBe("High");
    expect(c.value).toBeGreaterThanOrEqual(0.75);
  });

  it("missing a source lowers confidence, not below floor", () => {
    const full = computeConfidence(input());
    const half = computeConfidence(input({ sourcesPresent: 1 }));
    expect(half.value).toBeLessThan(full.value);
    expect(half.reasons.join(" ")).toContain("1/2 sources");
  });

  it("no sources + no sample → Experimental", () => {
    const c = computeConfidence(
      input({ sourcesPresent: 0, sampleSize: 0, freshness: "unknown", agreement: 0.3 }),
    );
    expect(c.label).toBe("Experimental");
    expect(c.value).toBeLessThan(0.3);
  });

  it("thin sample is flagged in reasons", () => {
    const c = computeConfidence(input({ sampleSize: 3 }));
    expect(c.reasons.join(" ")).toContain("thin sample");
  });

  it("stale data drags confidence below fresh equivalent", () => {
    const fresh = computeConfidence(input());
    const stale = computeConfidence(input({ freshness: "stale" }));
    expect(stale.value).toBeLessThan(fresh.value);
    expect(stale.reasons.join(" ")).toContain("stale");
  });

  it("value and coverage are bounded to [0,1]", () => {
    const c = computeConfidence(input({ sourcesPresent: 9, sourcesExpected: 2 }));
    expect(c.coverage).toBeLessThanOrEqual(1);
    expect(c.value).toBeLessThanOrEqual(1);
  });
});

import { describe, expect, it } from "vitest";
import { computeDemandSignal, type DemandSignalInput } from "./demand.js";

const full: DemandSignalInput = {
  reviewVelocity: 70,
  chartPersistence: 60,
  rankMomentum: 55,
  keywordDemand: 65,
  releaseCadence: 50,
  publisherStrength: 40,
  monetizationPresence: 80,
  geographicBreadth: 45,
  featuredPlacements: 30,
  advertising: 10,
};

describe("computeDemandSignal", () => {
  it("computes a score when advertising is unavailable — ads never gate it", () => {
    const { advertising: _drop, ...noAds } = full;
    const signal = computeDemandSignal({ ...noAds, advertising: null });
    expect(signal.score).toBeGreaterThan(0);
    expect(signal.score).toBeLessThanOrEqual(100);
    expect(signal.ads).toEqual({ hasMetaAds: null, status: "not_available_in_requested_market" });
    expect(signal.missing).toContain("advertising");
  });

  it("never coerces unavailable ads to false", () => {
    expect(computeDemandSignal({ ...full, advertising: null }).ads.hasMetaAds).toBeNull();
    expect(computeDemandSignal({ ...full, advertising: 0 }).ads.hasMetaAds).toBe(false); // genuinely observed zero
    expect(computeDemandSignal({ ...full, advertising: 5 }).ads.hasMetaAds).toBe(true);
  });

  it("is monotonic: more review velocity ⇒ score does not decrease", () => {
    const lo = computeDemandSignal({ ...full, reviewVelocity: 20 }).score;
    const hi = computeDemandSignal({ ...full, reviewVelocity: 90 }).score;
    expect(hi).toBeGreaterThanOrEqual(lo);
  });

  it("reports ok coverage when all core inputs present, source_omitted when some missing", () => {
    expect(computeDemandSignal(full).coverage).toBe("ok");
    expect(computeDemandSignal({ ...full, keywordDemand: null }).coverage).toBe("source_omitted");
  });

  it("excludes missing inputs from the mean rather than zeroing them", () => {
    // A record with one weak input present scores lower than the same input strong.
    const weak = computeDemandSignal({ reviewVelocity: 10 }).score;
    const strong = computeDemandSignal({ reviewVelocity: 90 }).score;
    expect(weak).toBeCloseTo(10, 5);
    expect(strong).toBeCloseTo(90, 5);
  });
});

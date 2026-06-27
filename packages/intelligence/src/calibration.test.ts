import { describe, it, expect } from "vitest";
import { parseInstallBucket, computeMonetisation } from "./calibration.js";

describe("parseInstallBucket", () => {
  it("parses open-ended buckets", () => {
    expect(parseInstallBucket("1,000,000+")).toEqual({ min: 1_000_000, max: null });
    expect(parseInstallBucket("1M+")).toEqual({ min: 1_000_000, max: null });
    expect(parseInstallBucket("500K+")).toEqual({ min: 500_000, max: null });
  });
  it("parses ranges", () => {
    expect(parseInstallBucket("100,000 - 500,000")).toEqual({ min: 100_000, max: 500_000 });
    expect(parseInstallBucket("10K - 50K")).toEqual({ min: 10_000, max: 50_000 });
  });
  it("returns null for junk/empty", () => {
    expect(parseInstallBucket(null)).toBeNull();
    expect(parseInstallBucket("")).toBeNull();
    expect(parseInstallBucket("lots")).toBeNull();
  });
});

describe("computeMonetisation", () => {
  it("higher modelled revenue → higher score", () => {
    const low = computeMonetisation({ modelledRevenueUsd: 200, modelledDownloads: 100, iapCount: 0 });
    const high = computeMonetisation({ modelledRevenueUsd: 80_000, modelledDownloads: 20_000, iapCount: 4 });
    expect(high.score!).toBeGreaterThan(low.score!);
  });

  it("calibrates downloads into the Play install band when a bucket is present", () => {
    // modelled 5,000,000/mo is implausible vs a 1M+ lifetime install base → clamped down
    const res = computeMonetisation({
      modelledRevenueUsd: 50_000,
      modelledDownloads: 5_000_000,
      iapCount: 2,
      installBucket: "1,000,000+",
    });
    expect(res.calibrated).toBe(true);
    expect(res.calibratedDownloads!).toBeLessThan(5_000_000);
    expect(res.calibratedDownloads!).toBeLessThanOrEqual(1_000_000 * 0.05);
    expect(res.note).toContain("Google Play");
  });

  it("is honest when uncalibrated (no Play data)", () => {
    const res = computeMonetisation({ modelledRevenueUsd: 1000, modelledDownloads: 400, iapCount: 1 });
    expect(res.calibrated).toBe(false);
    expect(res.calibratedDownloads).toBeNull();
    expect(res.note).toMatch(/no play install data/i);
  });

  it("no monetisation signal at all → partial, null score", () => {
    const res = computeMonetisation({ modelledRevenueUsd: 0, modelledDownloads: 0, iapCount: 0, price: 0 });
    expect(res.sourceStatus).toBe("partial");
    expect(res.score).toBeNull();
  });

  it("scores are bounded 0..100", () => {
    const res = computeMonetisation({
      modelledRevenueUsd: 10_000_000,
      modelledDownloads: 1_000_000,
      iapCount: 50,
      price: 9.99,
      hasSubscription: true,
    });
    expect(res.score!).toBeGreaterThan(0);
    expect(res.score!).toBeLessThanOrEqual(100);
  });
});

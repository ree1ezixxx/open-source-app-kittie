import { describe, it, expect } from "vitest";
import { analyzePain, MIN_PAIN_SAMPLE, type PainReviewInput } from "./pain.js";

const r = (text: string, rating: number): PainReviewInput => ({ text, rating });

// A fixture skewed toward pricing + crash complaints.
function corpus(): PainReviewInput[] {
  return [
    r("Way too expensive, the subscription is a rip off", 1),
    r("Love it but the price is too much money for what it does", 2),
    r("Paywall after one use, not worth it", 1),
    r("Keeps crashing every time I open it", 1),
    r("Crash on launch, totally broken since the update", 1),
    r("App freezes constantly", 2),
    r("Great app, works well for me", 5),
    r("Good but I wish it had a family sharing option", 4),
    r("Solid, no complaints", 5),
    r("Nice design and fast", 5),
  ];
}

describe("analyzePain", () => {
  it("ranks the most frequent, negative-skewed theme first", () => {
    const { clusters } = analyzePain(corpus());
    expect(clusters.length).toBeGreaterThan(0);
    expect(["Pricing & paywalls", "Crashes & bugs"]).toContain(clusters[0]!.theme);
    // pricing has 3 mentions, all negative
    const pricing = clusters.find((c) => c.theme === "Pricing & paywalls")!;
    expect(pricing.frequency).toBe(3);
    expect(pricing.negativeShare).toBe(1);
    expect(pricing.exampleReviews.length).toBeGreaterThan(0);
  });

  it("attaches a buildable opportunity to each cluster", () => {
    const { clusters } = analyzePain(corpus());
    expect(clusters.every((c) => c.opportunity.length > 0)).toBe(true);
  });

  it("scores higher when complaints are concentrated and negative", () => {
    const angry = analyzePain([
      ...Array.from({ length: 9 }, () => r("crash, broken, keeps crashing", 1)),
      r("fine", 5),
    ]);
    const calm = analyzePain(Array.from({ length: 10 }, () => r("great app, love it", 5)));
    expect(angry.score!).toBeGreaterThan(calm.score!);
  });

  it("returns null score (not 0) when the sample is too thin", () => {
    const thin = analyzePain([r("too expensive", 1), r("crashes", 1)]);
    expect(thin.sampleSize).toBeLessThan(MIN_PAIN_SAMPLE);
    expect(thin.score).toBeNull();
  });

  it("empty input yields no clusters and null score", () => {
    const empty = analyzePain([]);
    expect(empty.clusters).toEqual([]);
    expect(empty.score).toBeNull();
    expect(empty.sampleSize).toBe(0);
  });

  it("is deterministic", () => {
    expect(analyzePain(corpus())).toEqual(analyzePain(corpus()));
  });
});

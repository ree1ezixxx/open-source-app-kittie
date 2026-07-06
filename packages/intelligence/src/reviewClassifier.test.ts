import { describe, expect, it } from "vitest";
import { classifyReview, type ClassifiableReview } from "./reviewClassifier.js";

const review = (body: string, rating = 3, title: string | null = null): ClassifiableReview => ({
  rating,
  title,
  body,
});

describe("classifyReview — word-boundary matching (#266)", () => {
  it("does NOT tag Ads & Interruptions on words merely containing 'ad(s)'", () => {
    for (const body of [
      "loads fast and reads well",
      "made me a great salads planner",
      "the roads map feature is broadly useful",
      "upgrades were seamless, downloads are quick",
      "my dad loves the grade tracker",
    ]) {
      const tags = classifyReview(review(body));
      expect(tags.topics, body).not.toContain("Ads & Interruptions");
    }
  });

  it("still tags genuine ad complaints (singular, plural, phrases, punctuation)", () => {
    for (const body of [
      "too many ads between lessons",
      "an ad plays after every single round",
      "Ads, ads, ads. Constant interruptions.",
      "the advertising is relentless",
      "every advert is 30 seconds long",
      "one advertisement per minute is insane",
    ]) {
      const tags = classifyReview(review(body));
      expect(tags.topics, body).toContain("Ads & Interruptions");
    }
  });

  it("keeps boundary discipline across other short keywords", () => {
    // 'ui' must not match 'quite'/'juice'; 'lag' must not match 'flag'; 'sync' not 'synchrotron'? (sync+s? matches 'syncs' only)
    expect(classifyReview(review("quite a juicy update")).topics).not.toContain("User Interface");
    expect(classifyReview(review("the flag icon is cute")).topics).not.toContain("App Performance");
    expect(classifyReview(review("the ui is clean")).topics).toContain("User Interface");
    expect(classifyReview(review("constant lag on my phone")).topics).toContain("App Performance");
  });

  it("free trailing plural keeps singular keywords catching plurals", () => {
    expect(classifyReview(review("the notifications never stop")).topics).toContain("Notifications");
    expect(classifyReview(review("refunds are impossible to get")).topics).toContain("Payment Issues");
  });

  it("catches inflection variants that substring matching used to cover", () => {
    expect(classifyReview(review("it keeps crashing on launch")).topics).toContain("App Performance");
    expect(classifyReview(review("the app keeps freezing mid lesson")).topics).toContain("App Performance");
    expect(classifyReview(review("I cancelled but was still charged")).improvementAreas).toContain(
      "Cancellation Process",
    );
  });

  it("sentiment words are boundary-safe too", () => {
    // 'best' must not fire inside 'bestow'; rating 2 + no negative word => negative (not mixed)
    expect(classifyReview(review("they bestowed nothing on us", 2)).sentiment).toBe("negative");
    // cold-verify F2: sentiment words take NO free plural — 'goods' must not fire 'good'
    expect(classifyReview(review("the goods never arrived", 2)).sentiment).toBe("negative");
    // genuine positive word on a low rating => mixed
    expect(classifyReview(review("great idea, broken execution", 2)).sentiment).toBe("mixed");
    expect(classifyReview(review("I'd recommend it to anyone", 5)).sentiment).toBe("positive");
  });

  it("contract shape unchanged (ClassifiableReview → ReviewTags)", () => {
    const tags = classifyReview(review("fine app", 4, "ok"));
    expect(Object.keys(tags).sort()).toEqual(["improvementAreas", "sentiment", "topics"]);
  });
});

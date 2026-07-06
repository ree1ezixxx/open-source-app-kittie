import { describe, expect, it } from "vitest";
import { classifyReview, MIGRATION_MAP, type ClassifiableReview } from "./reviewClassifier.js";

const review = (body: string, rating = 3, title: string | null = null): ClassifiableReview => ({
  rating,
  title,
  body,
});

describe("classifyReview — word-boundary matching (#266, v2 labels)", () => {
  it("does NOT tag Ads Experience on words merely containing 'ad(s)'", () => {
    for (const body of [
      "loads fast and reads well",
      "made me a great salads planner",
      "the roads map feature is broadly useful",
      "upgrades were seamless, downloads are quick",
      "my dad loves the grade tracker",
    ]) {
      expect(classifyReview(review(body)).topics, body).not.toContain("Ads Experience");
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
      expect(classifyReview(review(body)).topics, body).toContain("Ads Experience");
    }
  });

  it("keeps boundary discipline across short keywords", () => {
    expect(classifyReview(review("quite a juicy update")).topics).not.toContain("Design & Usability");
    expect(classifyReview(review("the flag icon is cute")).topics).not.toContain("Stability & Performance");
    expect(classifyReview(review("the ui is clean")).topics).toContain("Design & Usability");
    expect(classifyReview(review("constant lag on my phone")).topics).toContain("Stability & Performance");
  });

  it("sentiment words are boundary-safe and take no free plural", () => {
    expect(classifyReview(review("they bestowed nothing on us", 2)).sentiment).toBe("negative");
    expect(classifyReview(review("the goods never arrived", 2)).sentiment).toBe("negative");
    expect(classifyReview(review("great idea, broken execution", 2)).sentiment).toBe("mixed");
    expect(classifyReview(review("I'd recommend it to anyone", 5)).sentiment).toBe("positive");
  });

  it("normalizes curly apostrophes before matching (#272)", () => {
    expect(classifyReview(review("app won’t load since the update")).topics).toContain("Stability & Performance");
    expect(classifyReview(review("I can’t cancel my plan", 1)).improvementAreas).toContain("Trial & Billing Deception");
  });

  it("contract shape unchanged (ClassifiableReview → ReviewTags)", () => {
    const tags = classifyReview(review("fine app", 4, "ok"));
    expect(Object.keys(tags).sort()).toEqual(["improvementAreas", "sentiment", "topics"]);
  });
});

describe("taxonomy v2 — improvement-area fixtures (2 per decision label)", () => {
  const CASES: Array<[string, string[]]> = [
    ["an unskippable ad after every level is too much", ["Ad Intrusiveness"]],
    ["bombarded with ads the moment I open it", ["Ad Intrusiveness"]],
    ["everything is paywalled now, it used to be free", ["Subscription Lock-In"]],
    ["total cash grab, not worth the subscription", ["Subscription Lock-In"]],
    ["cancelled but they kept charging my card", ["Trial & Billing Deception"]],
    ["was charged after trial ended without warning", ["Trial & Billing Deception"]],
    ["support denied my refund, no refund after a week", ["Refund Friction"]],
    ["impossible to get my money back", ["Refund Friction"]],
    ["the step counter is wildly inaccurate", ["Accuracy Failure"]],
    ["translations are just wrong half the time", ["Accuracy Failure"]],
    ["update wiped my data, lost my progress entirely", ["Crash & Data Loss"]],
    ["crashes on launch and corrupted my save", ["Crash & Data Loss"]],
    ["takes forever to load each page", ["Performance Drag"]],
    ["drains battery like nothing else", ["Performance Drag"]],
    ["no instructions anywhere, can't figure out the setup", ["Onboarding Confusion"]],
    ["not clear how to start a workout at all", ["Onboarding Confusion"]],
    ["settings are buried in menus, hard to find anything", ["Navigation & Usability"]],
    ["so cluttered and hard to use since the redesign", ["Navigation & Usability"]],
    ["the guilt trip notifications are unbearable", ["Notification Fatigue"]],
    ["constant notifications even after I muted it", ["Notification Fatigue"]],
    ["no way to export my data as csv", ["Missing Export & Portability"]],
    ["let me transfer my history to a new phone", ["Missing Export & Portability"]],
    ["sync broken between phone and tablet", ["Sync Reliability"]],
    ["progress is always out of sync across devices", ["Sync Reliability"]],
    ["three tickets and only automated replies", ["Support Unresponsiveness"]],
    ["no way to contact an actual human", ["Support Unresponsiveness"]],
    ["pretty sure they are selling my data", ["Privacy Anxiety"]],
    ["asks for too many permissions, feels invasive", ["Privacy Anxiety"]],
    ["ran out of levels in a week, needs more content", ["Content Gaps"]],
    ["so repetitive after the first month", ["Content Gaps"]],
    ["locked out and the recovery email never arrives", ["Account Recovery Trouble"]],
    ["lost my account and reset password doesn't work", ["Account Recovery Trouble"]],
  ];
  it.each(CASES)("%s → %j", (body, labels) => {
    const tags = classifyReview(review(body, 1));
    for (const label of labels) expect(tags.improvementAreas, body).toContain(label);
  });
});

describe("taxonomy v2 — topic fixtures", () => {
  const CASES: Array<[string, string]> = [
    ["the monthly price is absurd", "Pricing & Subscription"],
    ["keeps freezing mid workout", "Stability & Performance"],
    ["sign up flow took ten minutes", "Onboarding & Signup"],
    ["can't log in since yesterday", "Account & Login"],
    ["double charged this month", "Billing & Refunds"],
    ["the new layout is confusing", "Design & Usability"],
    ["lessons are excellent and varied", "Content Quality"],
    ["please add the ability to duplicate entries", "Feature Requests"],
    ["reminders come at the perfect time", "Notifications"],
    ["my streak reset for no reason", "Progress & Data"],
    ["worried about my personal data here", "Privacy & Security"],
    ["customer service actually replied fast", "Support & Service"],
    ["voiceover support is flawless", "Accessibility"],
  ];
  it.each(CASES)("%s → %s", (body, label) => {
    expect(classifyReview(review(body)).topics, body).toContain(label);
  });
});

describe("MIGRATION_MAP", () => {
  const V2_ALL = new Set([
    "Ads Experience", "Pricing & Subscription", "Stability & Performance", "Onboarding & Signup",
    "Account & Login", "Billing & Refunds", "Design & Usability", "Content Quality",
    "Feature Requests", "Notifications", "Progress & Data", "Privacy & Security",
    "Support & Service", "Accessibility",
    "Ad Intrusiveness", "Subscription Lock-In", "Trial & Billing Deception", "Refund Friction",
    "Accuracy Failure", "Crash & Data Loss", "Performance Drag", "Onboarding Confusion",
    "Navigation & Usability", "Notification Fatigue", "Missing Export & Portability",
    "Sync Reliability", "Support Unresponsiveness", "Privacy Anxiety", "Content Gaps",
    "Account Recovery Trouble",
  ]);
  it("covers every v1 label and maps only to live v2 labels", () => {
    const V1 = [
      "Subscription Pricing", "App Performance", "Customer Support", "Account Access",
      "Payment Issues", "User Interface", "Ads & Interruptions", "Content & Library",
      "Features", "Notifications", "Feature Functionality", "Billing Accuracy",
      "Cancellation Process", "Payment Options", "App Value", "Account Recovery",
      "Push Notifications", "Free Trial Policy", "Data Security", "Cross-Platform Sync",
      "Content Moderation",
    ];
    for (const v1 of V1) expect(Object.keys(MIGRATION_MAP), v1).toContain(v1);
    for (const targets of Object.values(MIGRATION_MAP)) {
      for (const t of targets) expect(V2_ALL.has(t), t).toBe(true);
    }
  });
});

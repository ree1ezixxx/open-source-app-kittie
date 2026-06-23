import { describe, expect, it } from "vitest";
import { isMissing, isPresent, missing, observed } from "@kittie/core";
import type { Provenanced } from "@kittie/types";
import { AnalyzerError } from "./analyzer.js";
import { FixtureAnalyzer } from "./fixture-analyzer.js";
import { analyseListingMedia, deriveOriginalUiBlueprint, type ListingMediaInput } from "./pipeline.js";
import type { ScreenReading } from "./types.js";

// --- fixtures: canned readings standing in for what Gemma would return ---

const ONBOARDING: ScreenReading = {
  role: "onboarding",
  summary: "Welcome carousel introducing the meditation app",
  components: [
    { kind: "button", label: "Get Started" },
    { kind: "page_indicator", label: null },
  ],
  featureClaims: ["guided meditation", "sleep stories"],
  monetisationSignals: [],
  visibleText: ["Find your calm"],
  confidence: 0.9,
};

const PAYWALL: ScreenReading = {
  role: "paywall",
  summary: "Subscription paywall with a 7-day free trial",
  components: [
    { kind: "button", label: "Start Free Trial" },
    { kind: "price_card", label: "£59.99/year" },
  ],
  featureClaims: ["unlimited sessions", "sleep stories"],
  monetisationSignals: ["subscription", "free trial"],
  visibleText: ["7 days free, then £59.99/year"],
  confidence: 0.8,
};

function recordWith(screenshotUrls: Provenanced<string[]>): ListingMediaInput {
  return {
    appId: observed("apple:123"),
    title: observed("Calm Clone"),
    screenshotUrls,
  };
}

describe("analyseListingMedia → deriveOriginalUiBlueprint", () => {
  it("derives a screen taxonomy + UI blueprint from fixture media", async () => {
    const analyzer = new FixtureAnalyzer({
      "https://img/1.png": ONBOARDING,
      "https://img/2.png": PAYWALL,
    });
    const analysis = await analyseListingMedia(
      recordWith(observed(["https://img/1.png", "https://img/2.png"])),
      analyzer,
    );

    expect(analysis.coverage).toBe("ok");
    expect(analysis.screens).toHaveLength(2);
    expect(analysis.screens.every((s) => isPresent(s.reading))).toBe(true);
    // per-screen readings are LLM inferences
    expect(analysis.screens[0]!.reading.kind).toBe("inferred");

    const blueprint = deriveOriginalUiBlueprint(analysis);
    expect(isPresent(blueprint)).toBe(true);
    expect(blueprint.kind).toBe("derived");
    expect(blueprint.coverage).toBe("ok");

    const bp = blueprint.value!;
    expect(bp.screenTaxonomy).toEqual(["onboarding", "paywall"]);
    expect(bp.navigationHypothesis).toEqual(["onboarding", "paywall"]);
    expect(bp.monetisationPatterns).toContain("subscription");
    expect(bp.monetisationPatterns).toContain("free trial");
    // deduped across the two screens
    expect(bp.featureClaims).toEqual([
      "guided meditation",
      "sleep stories",
      "unlimited sessions",
    ]);
    expect(bp.screens.map((s) => s.sourceImageIndex)).toEqual([0, 1]);
  });

  it("absent media surfaces a coverage reason, never a bare empty", async () => {
    const analyzer = new FixtureAnalyzer({});
    const analysis = await analyseListingMedia(
      recordWith(missing<string[]>("scrape_failed")),
      analyzer,
    );

    expect(analysis.screens).toEqual([]);
    expect(analysis.coverage).toBe("scrape_failed");

    const blueprint = deriveOriginalUiBlueprint(analysis);
    expect(isMissing(blueprint)).toBe(true);
    expect(blueprint.value).toBeNull();
    expect(blueprint.coverage).toBe("scrape_failed");
  });

  it("an empty screenshot array is confirmed_absent, not silently ok", async () => {
    const analysis = await analyseListingMedia(
      recordWith(observed<string[]>([])),
      new FixtureAnalyzer({}),
    );
    expect(analysis.coverage).toBe("confirmed_absent");
    expect(deriveOriginalUiBlueprint(analysis).coverage).toBe("confirmed_absent");
  });

  it("a per-image read failure degrades coverage but still derives from the good screens", async () => {
    const analyzer = new FixtureAnalyzer({
      "https://img/1.png": ONBOARDING,
      "https://img/2.png": new AnalyzerError("parse_failed", "model returned junk"),
    });
    const analysis = await analyseListingMedia(
      recordWith(observed(["https://img/1.png", "https://img/2.png"])),
      analyzer,
    );

    // one read ok, one failed → overall worst coverage
    expect(isPresent(analysis.screens[0]!.reading)).toBe(true);
    expect(isMissing(analysis.screens[1]!.reading)).toBe(true);
    expect(analysis.screens[1]!.reading.coverage).toBe("scrape_failed");
    expect(analysis.coverage).toBe("scrape_failed");

    // blueprint still derives from the readable screen, but carries the degraded coverage
    const blueprint = deriveOriginalUiBlueprint(analysis);
    expect(isPresent(blueprint)).toBe(true);
    expect(blueprint.value!.screenTaxonomy).toEqual(["onboarding"]);
    expect(blueprint.coverage).toBe("scrape_failed");
  });
});

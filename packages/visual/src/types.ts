/**
 * Visual-intelligence domain types (lane L7, epic #97).
 *
 * Kittie's "eyes": we turn a competitor's store-listing media into product
 * meaning a coding agent can reason over. Raw screenshots are commodity — the
 * value is what we DERIVE from them (screen roles, components, feature claims,
 * monetisation patterns, an original UI blueprint).
 *
 * Two epistemic layers, mirrored in provenance `kind` when these are wrapped:
 *  - a per-screen *reading* is an LLM **inference** (`kind: "inferred"`);
 *  - a whole-listing *blueprint* is **derived** from those readings
 *    (`kind: "derived"`).
 */

/** What a single screenshot is functionally showing. */
export type ScreenRole =
  | "onboarding"
  | "auth"
  | "home"
  | "feed"
  | "list"
  | "detail"
  | "search"
  | "profile"
  | "settings"
  | "paywall"
  | "empty_state"
  | "modal"
  | "other";

/** All screen roles, in a stable order — also the navigation-flow priority. */
export const SCREEN_ROLES: readonly ScreenRole[] = [
  "auth",
  "onboarding",
  "home",
  "feed",
  "search",
  "list",
  "detail",
  "profile",
  "settings",
  "paywall",
  "empty_state",
  "modal",
  "other",
];

/** One UI element read off a screen. */
export interface UiComponent {
  /** Coarse kind, e.g. "button", "tab_bar", "card", "input", "list_row". */
  kind: string;
  /** Visible text on the element, or null when it carries none. */
  label: string | null;
}

/**
 * The raw structured reading of ONE screenshot — exactly what the image
 * analyzer (Gemma, or a fixture) returns. No provenance here; the pipeline
 * wraps it in `Provenanced<ScreenReading>` (`kind: "inferred"`).
 */
export interface ScreenReading {
  role: ScreenRole;
  /** One-line description of what the screen does. */
  summary: string;
  components: UiComponent[];
  /** Product features this screen advertises or implies. */
  featureClaims: string[];
  /** Monetisation signals visible, e.g. "subscription", "free trial", "ads". */
  monetisationSignals: string[];
  /** Text legible on the screen. */
  visibleText: string[];
  /** The analyzer's 0..1 self-reported certainty. */
  confidence: number;
}

/** A screenshot URL paired with its (possibly absent) reading. */
export interface AnalysedScreen {
  imageUrl: string;
  /** `Provenanced<ScreenReading>` — `missing(...)` when that image couldn't be read. */
  reading: import("@kittie/types").Provenanced<ScreenReading>;
}

/** The result of analysing a whole listing's media. */
export interface ListingMediaAnalysis {
  appId: string | null;
  appTitle: string | null;
  screens: AnalysedScreen[];
  /** Worst coverage across all screens — never silently "ok" when nothing was read. */
  coverage: import("@kittie/types").CoverageStatus;
}

/** One screen in the derived blueprint. */
export interface BlueprintScreen {
  role: ScreenRole;
  summary: string;
  components: UiComponent[];
  /** Index of the source screenshot in the listing's media array. */
  sourceImageIndex: number;
}

/**
 * The headline derivation: an "original UI blueprint" reconstructed from the
 * listing media — what to build to match this app's experience.
 */
export interface UiBlueprint {
  appTitle: string | null;
  screens: BlueprintScreen[];
  /** Distinct screen roles present (the screen taxonomy). */
  screenTaxonomy: ScreenRole[];
  /** Deduped feature claims across all screens. */
  featureClaims: string[];
  /** Deduped monetisation patterns across all screens. */
  monetisationPatterns: string[];
  /** A best-guess ordered navigation flow (roles ordered by `SCREEN_ROLES`). */
  navigationHypothesis: ScreenRole[];
}

/** Versions stamped onto provenance so a reading/blueprint is reproducible-to-version. */
export const ANALYZER_VERSION = "gemma4-vision@1";
export const BLUEPRINT_VERSION = "ui-blueprint@1";

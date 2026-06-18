// Lean schema ported from ParthJadhav/app-store-screenshots (MIT).
// Trimmed to the one-click generation path: no locales, no per-element
// transforms, no manual editor state. We keep just what the renderer + export
// need to turn an uploaded screenshot into a framed App Store slide.

export type Device = "iphone" | "ipad";

/** Layouts the generator rotates through for visual rhythm across a deck. */
export type SlideLayout =
  | "hero" // headline above, device anchored at the bottom (cropped)
  | "device-bottom" // headline top, full device below
  | "device-top" // device on top, headline below (contrast)
  | "split" // caption stacked over an offset device (character-hero feel)
  | "no-device"; // big standalone headline, no device

/** Background treatment rendered behind a slide (mirrors appkittie's 9). */
export type BackgroundStyle =
  | "minimal"
  | "mesh"
  | "glass"
  | "spotlight"
  | "layered"
  | "solid"
  | "gradient"
  | "pattern"
  | "blurred";

/** Deck-level narrative flow (sequence of layouts). */
export type FlowStrategy = "default" | "hero-split" | "alternating-split";

/** Curated display fonts (loaded in index.html). */
export type FontId = "anton" | "grotesk" | "archivo" | "poppins" | "playfair" | "inter" | "dmsans";

/** Resolved colours used by the renderer. */
export type Palette = {
  base: string; // background base
  base2: string; // secondary background tone
  accent: string; // PRIMARY: headline emphasis, wordmark, device glow
  brand: string; // SECONDARY: background treatments' 2nd colour
  tint: string; // ACCENT: kicker pill + 3rd background stop
  fg: string; // headline text
  muted: string; // kicker / sub text
};

/** Deck-level design spec resolved by aiService and consumed by the engine.
 *  Three brand colours, surfaced in the UI as Primary / Secondary / Accent. */
export type DesignSpec = {
  background: BackgroundStyle;
  font: FontId;
  flow: FlowStrategy;
  accent: string; // Primary
  brand: string; // Secondary
  tint: string; // Accent
};

export type ThemeId =
  | "clean-light"
  | "dark-bold"
  | "warm-editorial"
  | "ocean-fresh"
  | "bloom-roast"
  | "midnight-pro"
  | "ivory-elegant";

export type Theme = {
  id: string;
  name: string;
  bg: string; // primary background
  bgAlt: string; // inverted background
  fg: string; // text on bg
  fgAlt: string; // text on bgAlt
  accent: string;
  muted: string;
};

/** One rendered slide. `screenshot` is a data: URL (uploaded) or empty. */
export type Slide = {
  id: string;
  layout: SlideLayout;
  label: string; // tiny uppercase kicker above the headline
  headline: string; // may contain \n for intentional line breaks
  screenshot: string; // data URL of the source app capture
  inverted: boolean; // dark background variant
};

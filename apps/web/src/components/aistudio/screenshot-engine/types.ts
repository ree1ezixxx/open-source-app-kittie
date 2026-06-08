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
  | "no-device"; // big standalone headline, no device

export type ThemeId =
  | "clean-light"
  | "dark-bold"
  | "warm-editorial"
  | "ocean-fresh"
  | "bloom-roast";

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

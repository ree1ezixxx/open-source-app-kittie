/**
 * Pure slide helper functions for generating safe, deterministic outputs.
 * Used by the generation engine to ensure screenshots are valid before rendering.
 */

import type { Slide } from "../../lib/aiService";

/** Ensure a slide is safe for export (has no broken image references). */
export function ensureSlideValid(slide: Slide): Slide {
  return {
    ...slide,
    screenshot: isValidScreenshot(slide.screenshot) ? slide.screenshot : "",
  };
}

/** Check if a screenshot string is safe to use in rendering. */
function isValidScreenshot(screenshot: string): boolean {
  if (!screenshot) return false;
  // Only allow data URLs (inline) or empty string for no-device layouts
  if (screenshot.startsWith("data:")) {
    // Validate minimal data URL format: data:type;base64,<data>
    const parts = screenshot.split(",");
    return parts.length === 2 && parts[1]!.length > 0;
  }
  return false;
}

/** Filter out any slides that would cause export failures. */
export function filterValidSlides(slides: Slide[]): Slide[] {
  return slides.map(ensureSlideValid).filter((s) => s.id.length > 0);
}

/** Deduplicate slide IDs in case of collisions (defensive). */
export function ensureUniqueSlideIds(slides: Slide[]): Slide[] {
  const seen = new Set<string>();
  return slides.map((s) => {
    if (seen.has(s.id)) {
      const newId = `${s.id}-${Math.random().toString(36).slice(2, 9)}`;
      seen.add(newId);
      return { ...s, id: newId };
    }
    seen.add(s.id);
    return s;
  });
}

/** Prepare slides for export (validate + deduplicate). */
export function prepareSlidesForExport(slides: Slide[]): Slide[] {
  return ensureUniqueSlideIds(filterValidSlides(slides));
}

/** Check if a slide can be rendered without fallbacks. */
export function slideIsComplete(slide: Slide): boolean {
  return (
    slide.id.length > 0 &&
    slide.headline.length > 0 &&
    (isValidScreenshot(slide.screenshot) || slide.layout === "no-device")
  );
}

/** Count complete slides (ready for export without placeholders). */
export function countCompleteSlides(slides: Slide[]): number {
  return slides.filter(slideIsComplete).length;
}

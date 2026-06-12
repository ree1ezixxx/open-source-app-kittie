/**
 * Pure validation helpers for AI Studio data integrity.
 * No side effects; used for pre-flight checks and error states.
 */

import type { Slide, UploadedImage } from "../../lib/aiService";

/** Max file size in bytes: 10 MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Max file size for warning (show size warning): 5 MB */
export const FILE_SIZE_WARN = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ValidationError {
  code: "file-too-large" | "unsupported-format" | "read-error" | "no-screenshots" | "export-failed";
  message: string;
  details?: string;
}

/** Check if a File is a valid image for upload. */
export function validateUploadFile(file: File): ValidationError | null {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return {
      code: "unsupported-format",
      message: `${file.name} is not supported`,
      details: "Upload PNG, JPG, or WebP images",
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      code: "file-too-large",
      message: `${file.name} is too large`,
      details: `Max file size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB`,
    };
  }
  return null;
}

/** Check if a slide has a valid screenshot for rendering. */
export function slideHasScreenshot(slide: Slide): boolean {
  return !!(slide.screenshot && slide.screenshot.startsWith("data:"));
}

/** Count slides with valid screenshots. */
export function countValidScreenshots(slides: Slide[]): number {
  return slides.filter(slideHasScreenshot).length;
}

/** Check if a generation can be exported (has at least one valid screenshot). */
export function canExportGeneration(slides: Slide[]): boolean {
  return slides.length > 0 && slides.some(slideHasScreenshot);
}

/** Describe why a generation cannot be exported. */
export function exportBlockReason(slides: Slide[]): string | null {
  if (slides.length === 0) return "No slides generated";
  const validCount = countValidScreenshots(slides);
  if (validCount === 0) return "No screenshots uploaded";
  return null;
}

/** Check if an uploaded image can be read as a data URL. */
export function isValidDataUrl(url: string): boolean {
  return url.startsWith("data:") && url.includes(",");
}

/** Validate that a batch of uploaded images are all valid. */
export function validateUploadedImages(images: UploadedImage[]): ValidationError | null {
  for (const img of images) {
    if (!isValidDataUrl(img.dataUrl)) {
      return {
        code: "read-error",
        message: `Could not read ${img.name}`,
        details: "The file may be corrupted",
      };
    }
  }
  return null;
}

/**
 * Check if export results indicate a serious problem.
 * Returns error if >50% of exports failed.
 */
export function evaluateExportResults(ok: number, failed: number): ValidationError | null {
  const total = ok + failed;
  if (total === 0) return null;
  const failureRate = failed / total;
  if (failureRate > 0.5) {
    return {
      code: "export-failed",
      message: "Export partially failed",
      details: `${ok}/${total} sizes exported. Try a smaller image or refresh.`,
    };
  }
  return null;
}

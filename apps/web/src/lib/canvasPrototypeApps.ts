/** Three data-rich apps for the App Canvas UI prototype (hardcoded). */
export const CANVAS_PROTOTYPE_APP_IDS = [
  "apple:544007664", // YouTube
  "apple:389801252", // Instagram
  "apple:570060128", // Duolingo
] as const;

export type CanvasPrototypeAppId = (typeof CANVAS_PROTOTYPE_APP_IDS)[number];

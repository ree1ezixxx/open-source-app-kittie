/* ============================================================
   iOS Clone Engine — types

   The engine turns a trending app's listing metadata into a *buildable*
   SwiftUI app that clones its core UX. Two stages:

     1. blueprint  — Gemini reads the listing and emits a strict, validated
        AppBlueprint (structure only: tabs, screens, sample content, theme).
     2. codegen    — a DETERMINISTIC renderer turns the blueprint into a
        complete xcodegen SwiftUI project. Determinism on this side is what
        guarantees the output always compiles, no matter what the model says.
   ============================================================ */

/** Minimal listing input the engine needs (a subset of AppDetail). */
export interface CloneSource {
  id: string;
  title: string;
  developer: string;
  category: string | null;
  description: string | null;
  /** Listing screenshots — used only as creative context for the model. */
  screenshotUrls?: string[];
}

export type TabKind = "feed" | "list" | "grid" | "form" | "profile";

/** A single sample content item shown inside a screen. */
export interface BlueprintItem {
  title: string;
  subtitle: string;
  /** A short trailing detail — a price, a metric, a date, a tag. */
  detail: string;
}

/** One tab / primary screen of the cloned app. */
export interface BlueprintTab {
  title: string;
  /** SF Symbol name for the tab bar (validated against a known set). */
  symbol: string;
  kind: TabKind;
  /** Large screen headline. */
  headline: string;
  /** Supporting one-liner under the headline. */
  subhead: string;
  /** Sample content rendered on the screen (2–8 items). */
  items: BlueprintItem[];
}

/** The full validated plan for the cloned app. */
export interface AppBlueprint {
  /** Clone product name (a clear riff on the original, not identical). */
  appName: string;
  /** Reverse-DNS bundle id, e.g. "com.kittieclone.lumera". */
  bundleId: string;
  /** One-line positioning statement. */
  tagline: string;
  /** Primary accent color as "#RRGGBB". */
  accentHex: string;
  /** The core noun the app revolves around, e.g. "Workout", "Recipe". */
  primaryEntity: string;
  /** 2–5 primary screens. */
  tabs: BlueprintTab[];
}

/** A generated source file: path is relative to the project root. */
export interface GeneratedFile {
  path: string;
  contents: string;
}

/** The complete engine output. */
export interface CloneResult {
  blueprint: AppBlueprint;
  /** xcodegen project name (sanitized Swift-safe). */
  projectName: string;
  files: GeneratedFile[];
  /** Shell the user/agent runs to build it. */
  buildCommands: string[];
}

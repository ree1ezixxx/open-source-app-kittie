/**
 * `@kittie/visual` — Kittie's eyes (lane L7, epic #97).
 * Derive product meaning from competitor listing media. The moat is the
 * derivation, not the raw media; honesty (L0) is enforced in the pipeline.
 */
export {
  analyseListingMedia,
  deriveOriginalUiBlueprint,
  type ListingMediaInput,
} from "./pipeline.js";

export {
  AnalyzerError,
  type ListingMediaAnalyzer,
  type ScreenInput,
} from "./analyzer.js";
export { OllamaAnalyzer, type OllamaAnalyzerOptions } from "./ollama-analyzer.js";
export { FixtureAnalyzer, type FixtureEntry } from "./fixture-analyzer.js";

export { coverageForCause, type AnalyzerFailureCause } from "./coverage.js";

export {
  SCREEN_ROLES,
  ANALYZER_VERSION,
  BLUEPRINT_VERSION,
  type ScreenRole,
  type UiComponent,
  type ScreenReading,
  type AnalysedScreen,
  type ListingMediaAnalysis,
  type BlueprintScreen,
  type UiBlueprint,
} from "./types.js";

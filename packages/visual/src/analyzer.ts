/**
 * The image-analysis seam (lane L7).
 *
 * The pipeline derives meaning from screenshots through this ONE interface; the
 * engine behind it is swappable. `OllamaAnalyzer` is the real, local one
 * (Gemma vision); `FixtureAnalyzer` is the deterministic one tests inject — so
 * CI never needs Ollama and never flakes on model drift.
 */
import type { ScreenReading } from "./types.js";
import type { AnalyzerFailureCause } from "./coverage.js";

/** One screenshot handed to the analyzer. */
export interface ScreenInput {
  /** Where the image lives; the analyzer fetches it (unless `imageBase64` is set). */
  imageUrl?: string;
  /** Pre-fetched image bytes, base64-encoded — skips the network fetch. */
  imageBase64?: string;
  /** Position of this screenshot in the listing's media array (for blueprint mapping). */
  index: number;
  /** App title, passed to the model as context. */
  appTitle?: string | null;
}

/** Reads a single screenshot into a structured `ScreenReading`, or throws `AnalyzerError`. */
export interface ListingMediaAnalyzer {
  analyzeScreen(input: ScreenInput): Promise<ScreenReading>;
}

/**
 * A reading failure carrying the cause — the pipeline maps `.cause` to a
 * coverage status (see `coverageForCause`) rather than letting it crash a build.
 */
export class AnalyzerError extends Error {
  readonly cause: AnalyzerFailureCause;
  constructor(cause: AnalyzerFailureCause, message: string) {
    super(message);
    this.name = "AnalyzerError";
    this.cause = cause;
  }
}

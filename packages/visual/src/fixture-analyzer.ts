/**
 * The deterministic analyzer tests inject (lane L7).
 *
 * Keyed by screenshot URL (or `#<index>` when a URL is absent). A canned
 * `ScreenReading` is returned verbatim; a canned `AnalyzerError` is thrown — so
 * a test can exercise both the happy path and every failure-cause → coverage
 * mapping without Ollama, a network, or model non-determinism.
 */
import { AnalyzerError, type ListingMediaAnalyzer, type ScreenInput } from "./analyzer.js";
import type { ScreenReading } from "./types.js";

/** A fixture entry is either a reading to return or an error to throw. */
export type FixtureEntry = ScreenReading | AnalyzerError;

export class FixtureAnalyzer implements ListingMediaAnalyzer {
  constructor(private readonly entries: Record<string, FixtureEntry>) {}

  async analyzeScreen(input: ScreenInput): Promise<ScreenReading> {
    const key = input.imageUrl ?? `#${input.index}`;
    const entry = this.entries[key];
    if (entry === undefined) {
      throw new AnalyzerError("parse_failed", `no fixture reading for "${key}"`);
    }
    if (entry instanceof AnalyzerError) throw entry;
    return entry;
  }
}

/**
 * Failure-cause → coverage mapping (lane L7, builds on L0's honesty model).
 *
 * The invariant: a screen we couldn't read is NEVER a silent empty — it carries
 * a `CoverageStatus` saying why. We collapse the four ways reading can fail into
 * the L0 vocabulary so a consuming agent never mistakes "we couldn't look" for
 * "this app has a bare UI".
 */
import type { AbsentCoverage } from "@kittie/types";

/** The distinct ways producing a reading can fail. */
export type AnalyzerFailureCause =
  /** The record carried no screenshot URLs to read. */
  | "no_media"
  /** Ollama unreachable / model not pulled — we never got to look. */
  | "infra_unavailable"
  /** An image URL wouldn't fetch. */
  | "fetch_failed"
  /** The model replied but its JSON wouldn't parse/validate (after one retry). */
  | "parse_failed";

/** Map a failure cause to the L0 coverage status it should surface as. */
export function coverageForCause(cause: AnalyzerFailureCause): AbsentCoverage {
  switch (cause) {
    case "no_media":
      // We didn't attempt a read because there was nothing to read.
      return "not_attempted";
    case "infra_unavailable":
    case "fetch_failed":
    case "parse_failed":
      // We attempted and the attempt failed.
      return "scrape_failed";
  }
}

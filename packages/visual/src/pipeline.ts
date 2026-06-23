/**
 * The visual-intelligence pipeline (lane L7) — the same logic whichever analyzer
 * is plugged in. Two verbs so far:
 *
 *   analyseListingMedia      screenshots → per-screen readings (inferred)
 *   deriveOriginalUiBlueprint readings    → one UI blueprint   (derived)
 *
 * Honesty (L0) is enforced here, not in the analyzer: every absent reading is a
 * `missing(...)` carrying WHY, and a blueprint with nothing to derive from is
 * itself `missing(...)` — never a bare `[]` that reads as "this app has no UI".
 */
import { derived, downgradeCoverage, inferred, isPresent, mergeCoverage, missing } from "@kittie/core";
import type { AbsentCoverage, CoverageStatus, Provenanced } from "@kittie/types";
import type { CanonicalAppRecord } from "@kittie/db";
import { AnalyzerError, type ListingMediaAnalyzer } from "./analyzer.js";
import { coverageForCause } from "./coverage.js";
import {
  ANALYZER_VERSION,
  BLUEPRINT_VERSION,
  SCREEN_ROLES,
  type AnalysedScreen,
  type BlueprintScreen,
  type ListingMediaAnalysis,
  type ScreenRole,
  type UiBlueprint,
} from "./types.js";

/** The slice of a canonical record this lane reads — `screenshotUrls` is the input. */
export type ListingMediaInput = Pick<CanonicalAppRecord, "appId" | "title" | "screenshotUrls">;

const SOURCE_MODEL = "model:gemma4-vision";
const SOURCE_DERIVE = "derive:ui-blueprint";

/**
 * Verb: `analyse_listing_media`. Reads each screenshot through the analyzer and
 * returns per-screen `Provenanced<ScreenReading>` plus an overall coverage.
 * Propagates the record's own coverage when the media itself is absent.
 */
export async function analyseListingMedia(
  record: ListingMediaInput,
  analyzer: ListingMediaAnalyzer,
): Promise<ListingMediaAnalysis> {
  const appId = isPresent(record.appId) ? record.appId.value : null;
  const appTitle = isPresent(record.title) ? record.title.value : null;
  const urls = record.screenshotUrls;

  // Media absent at source: propagate WHY, never invent a read.
  if (!isPresent(urls)) {
    return { appId, appTitle, screens: [], coverage: urls.coverage };
  }
  // Media present but genuinely empty: the listing confirmedly has no screenshots.
  if (urls.value.length === 0) {
    return { appId, appTitle, screens: [], coverage: "confirmed_absent" };
  }

  const screens: AnalysedScreen[] = [];
  for (const [index, imageUrl] of urls.value.entries()) {
    try {
      const reading = await analyzer.analyzeScreen({ imageUrl, index, appTitle });
      screens.push({
        imageUrl,
        reading: inferred(reading, {
          source: SOURCE_MODEL,
          collectionMethod: "vision",
          transformVersion: ANALYZER_VERSION,
          confidence: reading.confidence,
        }),
      });
    } catch (err) {
      const cause = err instanceof AnalyzerError ? err.cause : "infra_unavailable";
      screens.push({
        imageUrl,
        reading: missing(coverageForCause(cause), {
          source: SOURCE_MODEL,
          collectionMethod: "vision",
          transformVersion: ANALYZER_VERSION,
        }),
      });
    }
  }

  const coverage = mergeCoverage(screens.map((s) => s.reading.coverage));
  return { appId, appTitle, screens, coverage };
}

/**
 * Verb: `derive_original_ui_blueprint`. Folds the readable screens into one
 * blueprint (screen taxonomy, deduped feature claims + monetisation patterns,
 * a navigation hypothesis). When nothing could be read, returns `missing(...)`
 * carrying the analysis's coverage — the blueprint is never a silent empty.
 */
export function deriveOriginalUiBlueprint(
  analysis: ListingMediaAnalysis,
): Provenanced<UiBlueprint> {
  const present = analysis.screens
    .map((screen, index) => ({ screen, index }))
    .filter((x) => isPresent(x.screen.reading));

  if (present.length === 0) {
    return missing<UiBlueprint>(asAbsent(analysis.coverage), {
      source: SOURCE_DERIVE,
      collectionMethod: "compute",
      transformVersion: BLUEPRINT_VERSION,
    });
  }

  const screens: BlueprintScreen[] = present.map(({ screen, index }) => {
    // Narrowed by the isPresent filter above; value is a ScreenReading.
    const reading = screen.reading.value!;
    return {
      role: reading.role,
      summary: reading.summary,
      components: reading.components,
      sourceImageIndex: index,
    };
  });

  const readings = present.map((x) => x.screen.reading.value!);
  const taxonomy = unique(screens.map((s) => s.role));
  const blueprint: UiBlueprint = {
    appTitle: analysis.appTitle,
    screens,
    screenTaxonomy: taxonomy,
    featureClaims: unique(readings.flatMap((r) => r.featureClaims)),
    monetisationPatterns: unique(readings.flatMap((r) => r.monetisationSignals)),
    navigationHypothesis: orderRoles(taxonomy),
  };

  const confidences = present.map((x) => x.screen.reading.confidence ?? 0.5);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  const blueprintValue = derived(blueprint, {
    source: SOURCE_DERIVE,
    collectionMethod: "compute",
    transformVersion: BLUEPRINT_VERSION,
    confidence: avgConfidence,
  });

  // Partial media (some screens failed to read) is honest: a blueprint built
  // from a subset carries the worst input coverage, not a clean "ok".
  return analysis.coverage === "ok"
    ? blueprintValue
    : downgradeCoverage(blueprintValue, analysis.coverage);
}

// ---- helpers ----

/** Coverage for an absent derivation — "ok" can't accompany an absent value. */
function asAbsent(c: CoverageStatus): AbsentCoverage {
  return c === "ok" ? "not_attempted" : c;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Order roles by `SCREEN_ROLES` to form a plausible navigation flow. */
function orderRoles(roles: ScreenRole[]): ScreenRole[] {
  const rank = (r: ScreenRole) => {
    const i = SCREEN_ROLES.indexOf(r);
    return i === -1 ? SCREEN_ROLES.length : i;
  };
  return [...roles].sort((a, b) => rank(a) - rank(b));
}

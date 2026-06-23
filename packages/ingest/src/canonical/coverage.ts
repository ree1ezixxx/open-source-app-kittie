import type { CanonicalAppRecord } from "@kittie/db";
import type { CoverageStatus, Freshness, Provenanced } from "@kittie/types";
import { mergeCoverage } from "@kittie/core";

const FRESHNESS_SEVERITY: Record<Freshness, number> = {
  fresh: 0,
  aging: 1,
  stale: 2,
  unknown: 3,
};

/** A roll-up of how complete and current a canonical record is. */
export interface RecordCoverageView {
  /** Worst coverage among the fields that were actually collected. */
  overall: CoverageStatus;
  /** Worst freshness among present fields; `unknown` when none carry a clock. */
  freshness: Freshness;
  /** Every field name → its coverage status (present and absent alike). */
  fields: Record<string, CoverageStatus>;
  /** Names of fields with no value. */
  missing: string[];
}

/**
 * Summarise a record's coverage. `overall`/`freshness` consider only the fields
 * that were actually collected (a `missing("not_attempted")` collection doesn't
 * drag a healthy listing down); the per-field map still reports everything.
 */
export function recordCoverageView(record: CanonicalAppRecord): RecordCoverageView {
  const fields: Record<string, CoverageStatus> = {};
  const missing: string[] = [];
  const presentCoverages: CoverageStatus[] = [];
  let worstFreshness: Freshness | null = null;

  for (const [key, raw] of Object.entries(record)) {
    const p = raw as Provenanced<unknown>;
    fields[key] = p.coverage;
    if (p.kind === "missing") {
      missing.push(key);
      continue;
    }
    presentCoverages.push(p.coverage);
    if (worstFreshness === null || FRESHNESS_SEVERITY[p.freshness] > FRESHNESS_SEVERITY[worstFreshness]) {
      worstFreshness = p.freshness;
    }
  }

  return {
    overall: presentCoverages.length > 0 ? mergeCoverage(presentCoverages) : "not_attempted",
    freshness: worstFreshness ?? "unknown",
    fields,
    missing,
  };
}

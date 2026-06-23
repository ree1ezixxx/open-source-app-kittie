import type { CanonicalAppRecord } from "@kittie/db";
import type { AbsentCoverage, Provenanced } from "@kittie/types";
import { applyFreshness, missing, observed } from "@kittie/core";

/** Context a source adapter needs to stamp provenance on every field. */
export interface AdapterContext {
  /** ISO-8601 instant the raw payload was fetched. */
  observedAt: string;
  /** Storefront market the metrics are for, e.g. `"US"`. */
  country?: string;
  /** With `maxAgeMs`, stamps freshness and downgrades aged fields to `stale`. */
  now?: number;
  maxAgeMs?: number;
}

/**
 * A source adapter maps one provider's shape into a `CanonicalAppRecord`. New
 * providers (a licensed feed, another store) implement this — the rest of the
 * platform never learns their raw shape.
 */
export interface SourceAdapter<Raw> {
  readonly source: string;
  toCanonical(raw: Raw, ctx: AdapterContext): CanonicalAppRecord;
}

/**
 * Builds the per-field `Provenanced` wrappers for one source, applying freshness
 * when the context supplies a clock. The honesty rules live here: a null/empty
 * value becomes an explicit `missing()` with a reason, never a bare value.
 */
export function fieldMaker(ctx: AdapterContext, source: string, method: string) {
  const baseMeta = {
    source,
    collectionMethod: method,
    observedAt: ctx.observedAt,
    licenseClass: "public" as const,
  };

  function fresh<T>(p: Provenanced<T>): Provenanced<T> {
    return ctx.now != null && ctx.maxAgeMs != null ? applyFreshness(p, ctx.now, ctx.maxAgeMs) : p;
  }

  return {
    /** A required value that is always present (always observed). */
    req<T>(value: T): Provenanced<T> {
      return fresh(observed(value, baseMeta));
    },
    /** A scalar that may be absent — `missing(absent)` when null/undefined. */
    opt<T>(value: T | null | undefined, absent: AbsentCoverage = "source_omitted"): Provenanced<T> {
      if (value === null || value === undefined) {
        return missing<T>(absent, { source, collectionMethod: method, licenseClass: "public" });
      }
      return fresh(observed(value, baseMeta));
    },
    /** An array — present only when non-empty; `[]` never silently means "none". */
    arr<T>(value: T[] | null | undefined, absent: AbsentCoverage = "source_omitted"): Provenanced<T[]> {
      if (!value || value.length === 0) {
        return missing<T[]>(absent, { source, collectionMethod: method, licenseClass: "public" });
      }
      return fresh(observed(value, baseMeta));
    },
    /** A collection this source never fetches — its own ingest path hasn't run. */
    notRun<T>(): Provenanced<T> {
      return missing<T>("not_attempted");
    },
  };
}

/** Date → ISO string, or null when absent. */
export function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

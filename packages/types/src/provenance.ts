/**
 * Provenance & coverage — the honesty primitives every Kittie data field is
 * wrapped in. "Empty" is always a *collection state* that says why, never a
 * silent market fact. Helpers to construct/merge/downgrade these live in
 * `@kittie/core`. (Lane L0, epic #97.)
 */

/**
 * Lifecycle of a single field's collection. Anything other than `ok` means the
 * value is absent or untrustworthy — and records *why*.
 *
 * Declared best→worst; the numeric severity used by `worstCoverage` /
 * `mergeCoverage` (in `@kittie/core`) follows this same order:
 * `ok` < `stale` < `confirmed_absent` < `source_omitted` < `not_attempted` < `scrape_failed`.
 */
export type CoverageStatus =
  | "ok"
  | "stale"
  | "confirmed_absent"
  | "source_omitted"
  | "not_attempted"
  | "scrape_failed";

/** Coverage values that legitimately accompany an absent value (everything but `ok`). */
export type AbsentCoverage = Exclude<CoverageStatus, "ok">;

/** How much epistemic weight a value carries. */
export type ValueKind =
  | "observed"
  | "modelled"
  | "derived"
  | "inferred"
  | "missing";

/** Value kinds that carry an actual value (everything except `missing`). */
export type PresentKind = Exclude<ValueKind, "missing">;

/** Age of a value relative to its freshness policy. */
export type Freshness = "fresh" | "aging" | "stale" | "unknown";

/** Usage/licensing classification of a field's source — gates redistribution/resale. */
export type LicenseClass = "public" | "licensed" | "derived" | "unknown";

/**
 * Every Kittie data field is wrapped in this. A present value (`kind` !==
 * `"missing"`) carries `value`; an absent one sets `value: null` and MUST still
 * carry a non-`ok` `coverage` explaining the absence — so no consumer ever
 * reads emptiness as a market fact.
 */
export interface Provenanced<T> {
  /** The value, or `null` when `kind` is `"missing"`. */
  value: T | null;
  kind: ValueKind;
  coverage: CoverageStatus;
  /** Stable source id, e.g. `"apple:rss"`, `"model:revenue@3"`; null when missing. */
  source: string | null;
  /** How it was collected, e.g. `"rss"`, `"lookup"`, `"scrape"`, `"compute"`; null when missing. */
  collectionMethod: string | null;
  /** ISO-8601 instant the value was observed/computed; null when missing. */
  observedAt: string | null;
  freshness: Freshness;
  licenseClass: LicenseClass;
  /** Version of the model/transform behind a modelled/derived value; null otherwise. */
  transformVersion: string | null;
  /** 0..1; null when a confidence is not meaningful (e.g. a hard observed fact). */
  confidence: number | null;
}

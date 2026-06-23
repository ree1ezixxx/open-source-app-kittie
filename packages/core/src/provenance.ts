/**
 * Provenance & coverage helpers — construct, merge and downgrade `Provenanced`
 * values. The one invariant: you cannot construct an absent value without a
 * coverage status saying why. (Lane L0, epic #97.)
 */
import type {
  AbsentCoverage,
  CoverageStatus,
  Freshness,
  PresentKind,
  Provenanced,
} from "@kittie/types";

/** Severity of each coverage status — higher = more degraded. */
const COVERAGE_SEVERITY: Record<CoverageStatus, number> = {
  ok: 0,
  stale: 1,
  confirmed_absent: 2,
  source_omitted: 3,
  not_attempted: 4,
  scrape_failed: 5,
};

/** Optional provenance metadata shared by every constructor. */
export interface ProvenanceMeta {
  source?: string | null;
  collectionMethod?: string | null;
  observedAt?: string | null;
  freshness?: Freshness;
  licenseClass?: Provenanced<unknown>["licenseClass"];
  transformVersion?: string | null;
  confidence?: number | null;
}

function withMeta(m: ProvenanceMeta) {
  return {
    source: m.source ?? null,
    collectionMethod: m.collectionMethod ?? null,
    observedAt: m.observedAt ?? null,
    freshness: m.freshness ?? "unknown",
    licenseClass: m.licenseClass ?? "unknown",
    transformVersion: m.transformVersion ?? null,
    confidence: m.confidence ?? null,
  } as const;
}

function present<T>(value: T, kind: PresentKind, m: ProvenanceMeta): Provenanced<T> {
  return { value, kind, coverage: "ok", ...withMeta(m) };
}

/** A ground-truth fact from a source. */
export function observed<T>(value: T, m: ProvenanceMeta = {}): Provenanced<T> {
  return present(value, "observed", m);
}

/** A model estimate (downloads, revenue, …). */
export function modelled<T>(value: T, m: ProvenanceMeta = {}): Provenanced<T> {
  return present(value, "modelled", m);
}

/** A metric computed from other fields. */
export function derived<T>(value: T, m: ProvenanceMeta = {}): Provenanced<T> {
  return present(value, "derived", m);
}

/** An agent/LLM inference. */
export function inferred<T>(value: T, m: ProvenanceMeta = {}): Provenanced<T> {
  return present(value, "inferred", m);
}

/**
 * An absent value. `coverage` MUST explain the absence (anything but `"ok"`) —
 * the type enforces it and we guard at runtime so an `any`-cast can't smuggle
 * `"ok"` past us. This is the invariant: no empty value without a reason.
 */
export function missing<T>(coverage: AbsentCoverage, m: ProvenanceMeta = {}): Provenanced<T> {
  if ((coverage as CoverageStatus) === "ok") {
    throw new Error('missing() requires a non-"ok" coverage status');
  }
  return { value: null, kind: "missing", coverage, ...withMeta(m) };
}

/** True when the value is actually present (narrows `value` to `T`). */
export function isPresent<T>(p: Provenanced<T>): p is Provenanced<T> & { value: T } {
  return p.kind !== "missing" && p.value !== null;
}

/** True when the value is absent. */
export function isMissing<T>(p: Provenanced<T>): boolean {
  return p.kind === "missing";
}

/** The more-degraded of two coverage statuses (see `COVERAGE_SEVERITY`). */
export function worstCoverage(a: CoverageStatus, b: CoverageStatus): CoverageStatus {
  return COVERAGE_SEVERITY[a] >= COVERAGE_SEVERITY[b] ? a : b;
}

/** Fold many coverage statuses to the worst. Empty list ⇒ `"not_attempted"`. */
export function mergeCoverage(statuses: CoverageStatus[]): CoverageStatus {
  if (statuses.length === 0) return "not_attempted";
  return statuses.reduce((acc, s) => worstCoverage(acc, s));
}

/** Degrade a value's coverage to at least `status` — never improves it. */
export function downgradeCoverage<T>(p: Provenanced<T>, status: CoverageStatus): Provenanced<T> {
  return { ...p, coverage: worstCoverage(p.coverage, status) };
}

/** Classify an `observedAt` instant against a max-age window. */
export function freshnessFrom(observedAt: string | null, now: number, maxAgeMs: number): Freshness {
  if (!observedAt) return "unknown";
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return "unknown";
  const age = now - t;
  if (age <= maxAgeMs) return "fresh";
  if (age <= maxAgeMs * 2) return "aging";
  return "stale";
}

/** Stamp freshness from `observedAt`; when stale, also downgrade coverage to `"stale"`. */
export function applyFreshness<T>(p: Provenanced<T>, now: number, maxAgeMs: number): Provenanced<T> {
  const freshness = freshnessFrom(p.observedAt, now, maxAgeMs);
  const next = { ...p, freshness };
  return freshness === "stale" ? downgradeCoverage(next, "stale") : next;
}

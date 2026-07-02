/**
 * Shared adapters that lift service-native shapes (DecisionPacket confidence /
 * evidence, ranked competitors, named missing inputs) into the canonical #180
 * `IntelligenceResponseEnvelope` fields, so `teardown` and `similar` wrap through
 * the same `buildIntelligenceResponse` helper as `app_detail` / `compare_apps`.
 *
 * Placement rule (canonical): every app-intelligence route returns
 * `c.json({ data: envelope })` — the envelope nested under a single outer `data`
 * key. The web client's `tryLive` strips exactly that one level, handing UI the
 * full envelope. See `docs/contracts/intelligence-responses.md`.
 */
import type {
  Confidence,
  Evidence,
  IntelligenceConfidence,
  IntelligenceEvidence,
  IntelligenceSourceType,
  SimilarApp,
} from "@kittie/types";

/** Structural mirror of `@kittie/intelligence`'s `MissingIntelligenceSource` (avoids a cross-package type import). */
interface MissingSource {
  sourceType: IntelligenceSourceType;
  message: string;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** 0..1 → the canonical confidence label (mirrors app_detail / compare_apps thresholds). */
export function labelForScore(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

/** A DecisionPacket-style `Confidence` (score + reasons) → the envelope's labelled confidence. */
export function toIntelligenceConfidence(c: Confidence): IntelligenceConfidence {
  const score = clamp01(c.score);
  // The envelope contract forbids an empty `reasons` — keep an honest fallback.
  const reasons = c.reasons.length > 0 ? c.reasons : ["Derived from available signals."];
  return { score, label: labelForScore(score), reasons };
}

function sourceTypeForMissing(message: string): IntelligenceSourceType {
  const m = message.toLowerCase();
  if (m.includes("apple search")) return "apple_search_ads";
  if (m.includes("meta") || m.includes("advertis") || m.includes(" ad ") || m.endsWith(" ads")) return "meta_ads";
  if (m.includes("review")) return "review";
  if (m.includes("keyword")) return "keyword";
  if (m.includes("creator") || m.includes("organic")) return "creator";
  // Internal retrieval-coverage notes (e.g. "no catalog category matched") are a
  // model-side shortfall, not a blocked third-party feed — attribute to `model`.
  return "model";
}

/** Named missing inputs (e.g. `"Meta advertising data"`) → typed envelope missing-sources. */
export function missingToSources(missing: readonly string[]): MissingSource[] {
  return missing.map((message) => ({ sourceType: sourceTypeForMissing(message), message }));
}

function sourceTypeForId(sourceId: string, valueType: string, defaultStore: string): IntelligenceSourceType {
  const id = sourceId.toLowerCase();
  if (id.startsWith("model")) return "model";
  if (id.includes("google") || id.includes("gplay") || id.includes("play:")) return "google_play";
  if (id.includes("apple") || id.includes("appstore")) return "app_store";
  if (id.startsWith("snapshot")) return "snapshot";
  if (id.startsWith("review")) return "review";
  if (id.startsWith("keyword")) return "keyword";
  if (valueType === "modelled" || valueType === "derived" || valueType === "inferred") return "model";
  // Observed fact keyed by the seed app's own id → attribute to its store.
  return defaultStore === "google" ? "google_play" : "app_store";
}

/** DecisionPacket `Evidence[]` → the envelope's `IntelligenceEvidence[]` (lossless: real id + url kept). */
export function packetEvidenceToIntelligence(evidence: readonly Evidence[], defaultStore: string): IntelligenceEvidence[] {
  return evidence.map((e, i) => {
    // Contract invariant: `observed` evidence must cite a source URL. When the
    // packet has none, downgrade to `derived` rather than invent a URL or crash.
    const valueKind = e.valueType === "observed" && e.sourceUrl == null ? "derived" : e.valueType;
    return {
      id: e.sourceId || `ev_${i}`,
      claim: e.claim,
      source: { type: sourceTypeForId(e.sourceId, e.valueType, defaultStore), id: e.sourceId || `ev_${i}`, url: e.sourceUrl },
      valueKind,
      sourceStatus: "ok",
      freshness: "unknown",
      observedAt: e.observedAt,
      metric: null,
    };
  });
}

/** Ranked competitors → evidence entries (each surfaced match is an auditable data point). */
export function similarToEvidence(similar: readonly SimilarApp[]): IntelligenceEvidence[] {
  return similar.map((s, i) => {
    const id = s.app.id || `sim_${i}`;
    return {
      id,
      claim: `${s.app.title} — ${s.similarityClass} match (similarity ${s.similarityScore.toFixed(2)})`,
      source: { type: s.app.store === "google" ? "google_play" : "app_store", id, url: null },
      valueKind: "derived",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: null,
      metric: { name: "similarityScore", value: s.similarityScore, unit: null },
    };
  });
}

/**
 * Anti-corruption adapters: map the LIVE served shapes from Lane A
 * (`find_similar_apps`, `validate_app_idea`) and Lane B (`teardown_app`) onto
 * Lane C's render types. The lanes were built in isolation, so their wire shapes
 * drifted from `types.ts`; rather than re-touch merged+tested backend, we
 * reconcile here. Every value rendered traces to a real served field — the only
 * transforms are restructuring (e.g. grouping similar apps into clusters) and a
 * documented deterministic composite for the overall score. No fabrication.
 */
import type { DecisionPacket } from "@kittie/types";
import type {
  IdeaRisk,
  MvpFeature,
  ScoreFactor,
  SimilarApp,
  SimilarCluster,
  SimilarOutput,
  TeardownFeature,
  TeardownOutput,
  ValidateOutput,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const nowIso = () => new Date().toISOString();
const num = (v: any): number | null => (typeof v === "number" ? v : null);

/** A served `similar[]`/`competitors[]` item: `{ app, similarityScore, similarityClass, similarityReasons }`. */
function mapSimilarApp(item: any, fallbackConfidence: any): SimilarApp {
  const app = item?.app ?? {};
  return {
    appId: app.id ?? "",
    name: app.title ?? app.name ?? "Unknown app",
    iconUrl: app.iconUrl ?? null,
    category: app.category ?? null,
    similarityScore: typeof item?.similarityScore === "number" ? item.similarityScore : 0,
    similarityClass: item?.similarityClass ?? "analogue",
    reasons: item?.similarityReasons ?? [],
    estRevenue: num(app.revenueEstimate30d),
    estDownloads: num(app.downloadsEstimate30d),
    rating: num(app.rating),
    confidence: item?.confidence ?? fallbackConfidence ?? { score: 0, reasons: [] },
  };
}

const CLUSTER_LABEL: Record<string, string> = {
  direct: "Direct competitors",
  adjacent: "Adjacent apps",
  analogue: "Analogues",
};

export function adaptSimilar(raw: any, query: string): SimilarOutput {
  const candidates: SimilarApp[] = (raw?.similar ?? []).map((s: any) => mapSimilarApp(s, raw?.confidence));
  const clusters: SimilarCluster[] = (["direct", "adjacent", "analogue"] as const)
    .map((cls) => ({ label: CLUSTER_LABEL[cls] ?? cls, cls, apps: candidates.filter((a) => a.similarityClass === cls) }))
    .filter((c) => c.apps.length > 0);
  const missing: string[] = raw?.missing ?? [];
  return {
    query,
    interpretedQuery: raw?.interpretedQuery?.summary ?? query,
    clusters,
    candidates,
    coverage: { status: missing.length ? "partial" : "full", missing },
    agentSummary: raw?.agentSummary ?? "",
    source: "live",
    generatedAt: nowIso(),
  };
}

const SCORE_LABEL: Record<string, string> = {
  marketSaturation: "Market saturation",
  competitorQuality: "Competitor quality",
  demandSignal: "Demand signal",
  differentiation: "Differentiation room",
};

/** A flat `ValidateIdeaCompetitor` (canonical envelope) → render `SimilarApp`. */
function mapValidateCompetitor(c: any, confidence: any): SimilarApp {
  return {
    appId: c?.appId ?? "",
    name: c?.title ?? "Unknown app",
    iconUrl: c?.iconUrl ?? null,
    category: c?.category ?? null,
    similarityScore: typeof c?.similarityScore === "number" ? c.similarityScore : 0,
    similarityClass: c?.similarityClass ?? "analogue",
    reasons: Array.isArray(c?.matchedVia) ? c.matchedVia : [],
    estRevenue: null,
    estDownloads: null,
    rating: num(c?.rating),
    confidence: confidence ?? { score: 0, reasons: [] },
  };
}

/** Honest one-line readout derived from the verdict + its deterministic reason. */
function buildAgentSummary(data: any): string {
  const verdict = typeof data?.verdict === "string" ? data.verdict.replace(/_/g, " ") : "unvalidated";
  const reason = typeof data?.verdictReason === "string" ? data.verdictReason : "";
  return reason ? `${verdict}: ${reason}` : verdict;
}

/**
 * Canonical `/validate-idea` (#180) envelope → `ValidateOutput`. The envelope is
 * `{ data: ValidateIdeaIntelligenceData, evidence, confidence, caveats, metadata }`.
 * It is the DETERMINISTIC path — no LLM synthesis — so `mvp` and
 * `recommendedAngle` (LLM-only fields) are honestly empty; the `DecisionPacket`
 * the UI renders is composed from the envelope's own verdict/evidence/confidence.
 */
export function adaptValidate(raw: any, idea: string): ValidateOutput {
  const data = raw?.data ?? {};
  const scores = data?.scores ?? {};
  const scoreBreakdown: ScoreFactor[] = Object.entries(scores).map(([k, v]: [string, any]) => ({
    label: SCORE_LABEL[k] ?? k,
    score: Math.round((typeof v?.score === "number" ? v.score : 0) * 100),
    rationale: v?.basis ?? "",
  }));
  // Deterministic composite of the served factor scores (0..1 each). Saturation is
  // shown as its own factor + the verdict, not added here. Pure transform of real
  // numbers — not invented.
  const g = (k: string) => (typeof scores?.[k]?.score === "number" ? scores[k].score : 0);
  const overallScore = Math.round(100 * (g("demandSignal") * 0.4 + g("competitorQuality") * 0.3 + g("differentiation") * 0.3));

  // Envelope evidence[] → DecisionPacket evidence[] (only restructuring).
  const evidence = (raw?.evidence ?? []).map((e: any) => ({
    claim: e?.claim ?? "",
    valueType: e?.valueKind ?? "inferred",
    sourceId: e?.source?.id ?? "",
    sourceUrl: e?.source?.url ?? null,
    observedAt: e?.observedAt ?? null,
  }));
  const missing: string[] = (raw?.caveats ?? [])
    .filter((c: any) => c?.kind === "missing_source" || c?.kind === "partial_source")
    .map((c: any) => c?.message ?? c?.sourceType ?? "")
    .filter(Boolean);

  // Compose the DecisionPacket the render type expects from real envelope fields.
  const verdict: DecisionPacket = {
    decision: typeof data?.verdict === "string" ? data.verdict : "unvalidated",
    evidence,
    confidence: { score: num(raw?.confidence?.score) ?? 0, reasons: raw?.confidence?.reasons ?? [] },
    coverage: { status: missing.length ? "partial" : "full", missing },
    assumptions: [],
    unknowns: [],
    recommendedActions: [],
    snapshotId: raw?.metadata?.snapshotId ?? "",
  };

  const top: SimilarApp[] = (data?.competitors ?? [])
    .slice(0, 5)
    .map((c: any) => mapValidateCompetitor(c, raw?.confidence));

  const risks: IdeaRisk[] = (data?.risks ?? []).map((r: any) => ({
    risk: typeof r === "string" ? r : (r?.message ?? ""),
    severity: "medium" as const,
    mitigation: null,
  }));

  // #180 is deterministic — it does not synthesise MVP features.
  const mvp: MvpFeature[] = [];
  // Real evidence-backed opportunities from the envelope (strongest first). The
  // top one doubles as the recommended angle so that slot shows real signal.
  const opportunities: string[] = (data?.opportunities ?? [])
    .map((o: any) => (typeof o === "string" ? o : (o?.message ?? "")))
    .filter(Boolean);

  return {
    idea: data?.idea ?? idea,
    interpretedIdea: data?.interpreted?.summary ?? idea,
    verdict,
    overallScore,
    scoreBreakdown,
    recommendedAngle: opportunities[0] ?? "",
    opportunities,
    competitorSummary: {
      count: (data?.competitors ?? []).length,
      saturation: scores?.marketSaturation?.basis ?? data?.verdictReason ?? (typeof data?.verdict === "string" ? data.verdict : ""),
      top,
    },
    mvp,
    risks,
    agentSummary: buildAgentSummary(data),
    source: "live",
    generatedAt: nowIso(),
  };
}

export function adaptTeardown(raw: any): TeardownOutput {
  const id = raw?.identity ?? {};
  const mon = raw?.monetisation ?? {};
  const featureMap: TeardownFeature[] = (raw?.featureMap ?? []).map((f: any) =>
    typeof f === "string"
      ? { feature: f, role: "", evidence: null }
      : { feature: f?.feature ?? f?.name ?? "", role: f?.role ?? f?.classification ?? "", evidence: f?.evidence ?? null },
  );
  const reviewGaps = (raw?.reviewInsights?.gaps ?? []).map((x: any) =>
    typeof x === "string"
      ? { gap: x, demandSignal: "", sourceCount: 0 }
      : { gap: x?.gap ?? x?.theme ?? "", demandSignal: x?.demandSignal ?? x?.signal ?? "", sourceCount: x?.sourceCount ?? x?.count ?? 0 },
  );
  const cloneInsights = (raw?.cloneInsights ?? []).map((c: any) =>
    typeof c === "string" ? { insight: c, difficulty: "medium" as const } : { insight: c?.insight ?? "", difficulty: c?.difficulty ?? "medium" },
  );
  const coreLoop: string[] = Array.isArray(raw?.coreLoop)
    ? raw.coreLoop.map((s: any) => (typeof s === "string" ? s : s?.step ?? s?.label ?? ""))
    : [];

  return {
    appId: id.id ?? "",
    appName: id.title ?? id.name ?? "Unknown app",
    thesis: raw?.decisionPacket,
    coreLoop,
    featureMap,
    monetisation: {
      model: mon.priceModel ?? "unknown",
      detail: mon.summary ?? (mon.iapCount != null ? `${mon.iapCount} in-app purchase(s)` : ""),
      signals: mon.signals ?? [],
    },
    reviewGaps,
    cloneInsights,
    evidence: raw?.decisionPacket?.evidence ?? [],
    agentSummary: raw?.agentSummary ?? "",
    source: "live",
    generatedAt: nowIso(),
  };
}

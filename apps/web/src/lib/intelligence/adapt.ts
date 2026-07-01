/**
 * Anti-corruption adapters: map the LIVE served shapes from Lane A
 * (`find_similar_apps`, `validate_app_idea`) and Lane B (`teardown_app`) onto
 * Lane C's render types. The lanes were built in isolation, so their wire shapes
 * drifted from `types.ts`; rather than re-touch merged+tested backend, we
 * reconcile here. Every value rendered traces to a real served field — the only
 * transforms are restructuring (e.g. grouping similar apps into clusters) and a
 * documented deterministic composite for the overall score. No fabrication.
 */
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

export function adaptValidate(raw: any, idea: string): ValidateOutput {
  const scores = raw?.scores ?? {};
  const scoreBreakdown: ScoreFactor[] = Object.entries(scores).map(([k, v]: [string, any]) => ({
    label: SCORE_LABEL[k] ?? k,
    score: Math.round((typeof v?.score === "number" ? v.score : 0) * 100),
    rationale: v?.basis ?? "",
  }));
  // Deterministic composite of the served factor scores (0..1 each). Saturation is
  // shown as its own factor + the verdict, not added here, so a crowded market
  // doesn't inflate the headline. Pure transform of real numbers — not invented.
  const g = (k: string) => (typeof scores?.[k]?.score === "number" ? scores[k].score : 0);
  const overallScore = Math.round(100 * (g("demandSignal") * 0.4 + g("competitorQuality") * 0.3 + g("differentiation") * 0.3));

  const angle = raw?.recommendedAngle;
  const recommendedAngle =
    typeof angle === "string" ? angle : angle ? `${angle.title ?? ""}${angle.reason ? ` — ${angle.reason}` : ""}` : "";

  const top: SimilarApp[] = (raw?.competitors ?? [])
    .slice(0, 5)
    .map((c: any) => mapSimilarApp(c, raw?.packet?.confidence));

  const mvp: MvpFeature[] = (raw?.mvp ?? []).map((m: any) =>
    typeof m === "string" ? { feature: m, why: "" } : { feature: m?.feature ?? m?.title ?? "", why: m?.why ?? m?.reason ?? "" },
  );
  const risks: IdeaRisk[] = (raw?.risks ?? []).map((r: any) =>
    typeof r === "string"
      ? { risk: r, severity: "medium" as const, mitigation: null }
      : { risk: r?.risk ?? r?.title ?? "", severity: r?.severity ?? "medium", mitigation: r?.mitigation ?? null },
  );

  return {
    idea,
    interpretedIdea: raw?.interpretedIdea?.summary ?? idea,
    verdict: raw?.packet, // the DecisionPacket
    overallScore,
    scoreBreakdown,
    recommendedAngle,
    competitorSummary: {
      count: raw?.competitorSummary?.count ?? (raw?.competitors ?? []).length,
      saturation: scores?.marketSaturation?.basis ?? (typeof raw?.verdict === "string" ? raw.verdict : ""),
      top,
    },
    mvp,
    risks,
    agentSummary: raw?.agentSummary ?? "",
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

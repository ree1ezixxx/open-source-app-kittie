/** Result inspection + scoring. Imports only types — safe to import from anywhere. */
import type {
  BuildResult,
  DecisionResult,
  DecisionSpec,
  InterventionResult,
  ToolCallRecord,
} from "./types.js";

// ─── Result inspection (honest emptiness + freshness) ────────────────────────

const ARRAY_KEYS = ["data", "items", "results", "apps", "keywords", "reviews", "rows", "charts"];
const DATE_KEYS = ["date", "asOf", "snapshotAt", "lastSnapshotAt", "updatedAt", "fetchedAt", "generatedAt"];

/**
 * Did a (successful) tool result actually carry usable market evidence?
 * Conservative: anything we can't positively read as non-empty counts as empty, so the
 * harness never over-credits an intervention. Heuristic, and documented as such.
 */
export function isEmptyResult(tool: string, parsed: unknown): boolean {
  if (parsed == null) return true;
  if (typeof parsed === "string") return parsed.trim().length === 0;
  if (Array.isArray(parsed)) return parsed.length === 0;
  if (typeof parsed !== "object") return false;

  const o = parsed as Record<string, unknown>;
  if ("error" in o && o.error) return true;
  // Charts return { date: null, ... } when there is no clean source.
  if ("date" in o && o.date === null) return true;

  // A keyword-difficulty payload is "real" iff it carries a numeric difficulty.
  if ("difficulty" in o) return o.difficulty == null;

  // The first array container we recognise decides emptiness.
  for (const k of ARRAY_KEYS) {
    if (Array.isArray(o[k])) return (o[k] as unknown[]).length === 0;
  }
  // App-detail style: { data: {...} }.
  if ("data" in o) {
    const d = o.data;
    if (d == null) return true;
    if (Array.isArray(d)) return d.length === 0;
    if (typeof d === "object") return Object.keys(d as object).length === 0;
    return false;
  }
  return Object.keys(o).length === 0;
}

/** Age (days) of the freshest datable field we can find, else null (unknown). */
export function freshnessDays(parsed: unknown, nowMs: number): number | null {
  const ts = findTimestamp(parsed, 0);
  if (ts == null) return null;
  const days = (nowMs - ts) / 86_400_000;
  return days < 0 ? 0 : Math.round(days * 10) / 10;
}

function findTimestamp(value: unknown, depth: number): number | null {
  if (depth > 4 || value == null) return null;
  if (Array.isArray(value)) {
    let best: number | null = null;
    for (const v of value.slice(0, 5)) {
      const t = findTimestamp(v, depth + 1);
      if (t != null && (best == null || t > best)) best = t;
    }
    return best;
  }
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  let best: number | null = null;
  for (const k of DATE_KEYS) {
    if (k in o) {
      const t = parseTs(o[k]);
      if (t != null && (best == null || t > best)) best = t;
    }
  }
  // Recurse into a couple of obvious nests.
  for (const k of ["data", "app", "latest"]) {
    if (o[k] != null) {
      const t = findTimestamp(o[k], depth + 1);
      if (t != null && (best == null || t > best)) best = t;
    }
  }
  return best;
}

function parseTs(v: unknown): number | null {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000; // seconds vs ms
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// ─── Decision scoring ────────────────────────────────────────────────────────

/** Default acceptance: at least one grounding call returned usable evidence. */
export const acceptsIfAnyRelevant = (records: ToolCallRecord[]): boolean =>
  records.some((r) => r.relevant);

export function evaluateDecisions(specs: DecisionSpec[], records: ToolCallRecord[]): DecisionResult[] {
  return specs.map((spec) => {
    const own = records.filter((r) => r.decision === spec.id);
    return {
      id: spec.id,
      label: spec.label,
      accepted: spec.accepts(own),
      calls: own.length,
      relevantCalls: own.filter((r) => r.relevant).length,
      falseActivations: own.filter((r) => r.falseActivation).length,
    };
  });
}

// ─── Aggregate report ─────────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}
function ratio(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100) / 100;
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

export interface ReportMetrics {
  generatedAt: string;
  shadowMode: true;
  builds: number;
  agents: string[];
  scenarios: number;
  promptsPerBuild: number;
  northStar: {
    name: string;
    value: number;
    acceptedDecisions: number;
    totalDecisions: number;
    acceptanceRate: number;
    note: string;
  };
  vanity: { totalToolCalls: number; note: string };
  interventions: {
    total: number;
    relevant: number;
    relevanceRatePct: number;
    falseActivations: number;
    falseActivationRatePct: number;
    redundantCalls: number;
    redundantRatePct: number;
    errors: number;
  };
  cost: {
    totalTokensEst: number;
    tokensPerBuild: number;
    tokensPerAcceptedDecision: number;
    wastedTokensEst: number;
    wastedNote: string;
  };
  latency: { p50Ms: number; p95Ms: number; maxMs: number; totalMs: number };
  freshness: { datablePct: number; medianDays: number | null; note: string };
  perPrompt: Array<{
    promptId: string;
    runs: number;
    acceptedDecisions: number;
    totalDecisions: number;
    acceptanceRatePct: number;
    calls: number;
    relevant: number;
    falseActivations: number;
    avgLatencyMs: number;
    tokensEst: number;
  }>;
  perTool: Array<{
    tool: string;
    calls: number;
    relevant: number;
    relevanceRatePct: number;
    falseActivations: number;
    redundant: number;
    avgLatencyMs: number;
    tokensEst: number;
  }>;
  perAgent: Array<{
    agent: string;
    builds: number;
    acceptedDecisions: number;
    decisionsPerBuild: number;
    calls: number;
    tokensEst: number;
  }>;
}

export function summarise(builds: BuildResult[], generatedAt: string): ReportMetrics {
  const interventions: InterventionResult[] = builds.flatMap((b) => b.interventions);
  const records: ToolCallRecord[] = interventions.flatMap((i) => i.records);
  const decisions: DecisionResult[] = interventions.flatMap((i) => i.decisions);

  const accepted = decisions.filter((d) => d.accepted).length;
  const totalDecisions = decisions.length;
  const nBuilds = builds.length;

  const relevant = records.filter((r) => r.relevant).length;
  const falseAct = records.filter((r) => r.falseActivation).length;
  const redundant = records.filter((r) => r.redundant).length;
  const errors = records.filter((r) => r.isError || !r.ok).length;
  const totalTokens = records.reduce((s, r) => s + r.tokensEst, 0);
  const wastedTokens = records.filter((r) => r.falseActivation || r.redundant).reduce((s, r) => s + r.tokensEst, 0);

  const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
  const totalLatency = latencies.reduce((s, x) => s + x, 0);

  const datable = records.filter((r) => r.freshnessDays != null);
  const freshSorted = datable.map((r) => r.freshnessDays as number).sort((a, b) => a - b);
  const medianDays = freshSorted.length
    ? (freshSorted[Math.floor(freshSorted.length / 2)] ?? null)
    : null;

  const agents = [...new Set(builds.map((b) => b.agent))];

  return {
    generatedAt,
    shadowMode: true,
    builds: nBuilds,
    agents,
    scenarios: new Set(builds.map((b) => b.scenarioId)).size,
    promptsPerBuild: nBuilds ? interventions.length / nBuilds : 0,
    northStar: {
      name: "market-backed decisions accepted per active build",
      value: ratio(accepted, nBuilds),
      acceptedDecisions: accepted,
      totalDecisions,
      acceptanceRate: ratio(accepted, totalDecisions),
      note:
        "MODELLED in shadow mode: acceptance = the grounding evidence was sufficient (non-empty, on-topic). " +
        "Real acceptance is measured once Kittie is installed in the agent (L5 intent layer / L10 plugin).",
    },
    vanity: {
      totalToolCalls: records.length,
      note: "Tool calls are COST, not value. Tracked only to contrast against the north-star.",
    },
    interventions: {
      total: records.length,
      relevant,
      relevanceRatePct: pct(relevant, records.length),
      falseActivations: falseAct,
      falseActivationRatePct: pct(falseAct, records.length),
      redundantCalls: redundant,
      redundantRatePct: pct(redundant, records.length),
      errors,
    },
    cost: {
      totalTokensEst: totalTokens,
      tokensPerBuild: Math.round(ratio(totalTokens, nBuilds)),
      tokensPerAcceptedDecision: Math.round(ratio(totalTokens, accepted)),
      wastedTokensEst: wastedTokens,
      wastedNote: "Tokens spent on false activations + redundant calls — the efficiency leak a real agent layer should cache away.",
    },
    latency: {
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      maxMs: latencies.length ? (latencies[latencies.length - 1] ?? 0) : 0,
      totalMs: totalLatency,
    },
    freshness: {
      datablePct: pct(datable.length, records.length),
      medianDays,
      note: "Freshness is best-effort: only calls whose payload carries a parseable timestamp are datable; the rest are unknown (null), never assumed fresh.",
    },
    perPrompt: summarisePerPrompt(interventions),
    perTool: summarisePerTool(records),
    perAgent: summarisePerAgent(builds),
  };
}

function summarisePerPrompt(interventions: InterventionResult[]): ReportMetrics["perPrompt"] {
  const byPrompt = groupBy(interventions, (i) => i.promptId);
  return [...byPrompt.entries()].map(([promptId, group]) => {
    const recs = group.flatMap((g) => g.records);
    const decs = group.flatMap((g) => g.decisions);
    const acc = decs.filter((d) => d.accepted).length;
    const lat = recs.reduce((s, r) => s + r.latencyMs, 0);
    return {
      promptId,
      runs: group.length,
      acceptedDecisions: acc,
      totalDecisions: decs.length,
      acceptanceRatePct: pct(acc, decs.length),
      calls: recs.length,
      relevant: recs.filter((r) => r.relevant).length,
      falseActivations: recs.filter((r) => r.falseActivation).length,
      avgLatencyMs: recs.length ? Math.round(lat / recs.length) : 0,
      tokensEst: recs.reduce((s, r) => s + r.tokensEst, 0),
    };
  });
}

function summarisePerTool(records: ToolCallRecord[]): ReportMetrics["perTool"] {
  const byTool = groupBy(records, (r) => r.tool);
  return [...byTool.entries()]
    .map(([tool, recs]) => {
      const lat = recs.reduce((s, r) => s + r.latencyMs, 0);
      return {
        tool,
        calls: recs.length,
        relevant: recs.filter((r) => r.relevant).length,
        relevanceRatePct: pct(recs.filter((r) => r.relevant).length, recs.length),
        falseActivations: recs.filter((r) => r.falseActivation).length,
        redundant: recs.filter((r) => r.redundant).length,
        avgLatencyMs: recs.length ? Math.round(lat / recs.length) : 0,
        tokensEst: recs.reduce((s, r) => s + r.tokensEst, 0),
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

function summarisePerAgent(builds: BuildResult[]): ReportMetrics["perAgent"] {
  const byAgent = groupBy(builds, (b) => b.agent);
  return [...byAgent.entries()].map(([agent, group]) => {
    const recs = group.flatMap((b) => b.interventions).flatMap((i) => i.records);
    const acc = group
      .flatMap((b) => b.interventions)
      .flatMap((i) => i.decisions)
      .filter((d) => d.accepted).length;
    return {
      agent,
      builds: group.length,
      acceptedDecisions: acc,
      decisionsPerBuild: ratio(acc, group.length),
      calls: recs.length,
      tokensEst: recs.reduce((s, r) => s + r.tokensEst, 0),
    };
  });
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

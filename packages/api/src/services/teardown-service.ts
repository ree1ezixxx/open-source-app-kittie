/**
 * `teardown_app` service (Lane B) — orchestrates the depth ladder. `quick` is
 * the pure deterministic blueprint from `@kittie/intelligence` (NO LLM). `standard`
 * layers a cached, locally-generated narrative (thesis, core problem, audience,
 * core loop, feature map, clone insights) on top; if the local model is
 * unavailable it degrades to `quick` — never fabricates. (`deep` lands next loop.)
 */
import type { AppDetail, Review } from "@kittie/types";
import {
  buildTeardownApp,
  type CloneInsights,
  type CoreLoop,
  type FeatureMap,
  type SectionLabel,
  type TeardownAppOutput,
  type TeardownDepth,
} from "@kittie/intelligence";
import { cachedGammaJson, GAMMA_MODEL } from "../lib/gamma.js";
import { getAppById, getAppReviews } from "./app-service.js";

/** Highest depth this loop implements; higher requests clamp down (honest `depth`). */
const IMPLEMENTED_MAX: TeardownDepth = "standard";
const ORDER: Record<TeardownDepth, number> = { quick: 0, standard: 1, deep: 2 };

interface StandardNarrative {
  thesis: string | null;
  coreUserProblem: string | null;
  audience: string | null;
  coreLoop: CoreLoop | null;
  featureMap: FeatureMap | null;
  cloneInsights: CloneInsights | null;
  monetisationSummary: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 6) : [];

function normalizeNarrative(raw: Record<string, unknown>): StandardNarrative {
  const cl = (raw.coreLoop ?? {}) as Record<string, unknown>;
  const fm = (raw.featureMap ?? {}) as Record<string, unknown>;
  const ci = (raw.cloneInsights ?? {}) as Record<string, unknown>;
  const coreLoop =
    str(cl.trigger) || str(cl.action) || str(cl.reward)
      ? {
          trigger: str(cl.trigger) ?? "",
          action: str(cl.action) ?? "",
          reward: str(cl.reward) ?? "",
          progress: str(cl.progress) ?? "",
          return: str(cl.return) ?? "",
        }
      : null;
  const featureMap: FeatureMap | null =
    fm.tableStakes || fm.retention || fm.monetisation || fm.differentiator
      ? {
          tableStakes: strArr(fm.tableStakes),
          retention: strArr(fm.retention),
          monetisation: strArr(fm.monetisation),
          differentiator: strArr(fm.differentiator),
        }
      : null;
  const difficultyRaw = Number((ci as { cloneDifficulty?: unknown }).cloneDifficulty);
  const cloneInsights: CloneInsights | null =
    ci.copy || ci.dontCopy || ci.gaps || ci.mvp
      ? {
          copy: strArr(ci.copy),
          dontCopy: strArr(ci.dontCopy),
          gaps: strArr(ci.gaps),
          mvp: strArr(ci.mvp),
          premiumLayer: strArr(ci.premiumLayer),
          cloneDifficulty: Number.isFinite(difficultyRaw) ? Math.min(5, Math.max(1, Math.round(difficultyRaw))) : 3,
        }
      : null;
  return {
    thesis: str(raw.thesis),
    coreUserProblem: str(raw.coreUserProblem),
    audience: str(raw.audience),
    coreLoop,
    featureMap,
    cloneInsights,
    monetisationSummary: str(raw.monetisationSummary),
  };
}

function buildStandardPrompt(app: AppDetail, base: TeardownAppOutput): string {
  const facts = {
    title: app.title,
    developer: app.developer,
    category: app.category,
    store: app.store,
    description: app.description?.slice(0, 700) ?? null,
    pricing: { price: app.price, model: base.monetisation.priceModel, iapCount: base.monetisation.iapCount },
    metrics: base.metrics,
    marketDecision: base.decisionPacket.decision,
    reviewTopics: base.reviewInsights?.topTopics.map((t) => t.label) ?? [],
    reviewImprovementAreas: base.reviewInsights?.topImprovementAreas.map((t) => t.label) ?? [],
    deterministicRisks: base.risks,
  };
  // Strategic fields (cloneInsights, featureMap) are emitted FIRST so the model
  // spends its strongest tokens on the teardown's core deliverable — gemma4:12b
  // under-fills whatever lands late in a large schema.
  return (
    "You are a senior product strategist writing a teardown of a mobile app for a founder weighing whether to build a competitor. " +
    "Infer positioning and clone strategy from ONLY the facts given. DO NOT invent metrics, numbers, or download/revenue figures — those are provided. " +
    "Fill EVERY field with concrete, specific content — never leave an array empty; give your best inference if unsure. " +
    "The cloneInsights and featureMap are the core deliverable — make them the richest part. " +
    "Return ONLY JSON with this exact shape and key order:\n" +
    '{"cloneInsights": {"copy":["..."],"dontCopy":["..."],"gaps":["..."],"mvp":["..."],"premiumLayer":["..."],"cloneDifficulty": 1}, ' +
    '"featureMap": {"tableStakes":["..."],"retention":["..."],"monetisation":["..."],"differentiator":["..."]}, ' +
    '"thesis": "one-sentence positioning", "coreUserProblem": "one sentence", "audience": "one sentence", ' +
    '"coreLoop": {"trigger":"","action":"","reward":"","progress":"","return":""}, ' +
    '"monetisationSummary": "one sentence"}\n' +
    "Each array holds exactly 3 concrete items (real feature names / strategy points, not fluff). " +
    "coreLoop follows the Hooked habit model (each a short phrase). cloneDifficulty is an integer 1 (trivial weekend clone) to 5 (very hard: regulation/network-effects/heavy infra).\n\n" +
    `FACTS:\n${JSON.stringify(facts)}`
  );
}

const INFERRED = (cached: boolean): SectionLabel => ({
  kind: "inferred",
  note: `${GAMMA_MODEL} (local)${cached ? ", cached" : ""}`,
});
const DEGRADED: SectionLabel = { kind: "missing", note: "local LLM unavailable — quick depth served" };

async function enrichStandard(base: TeardownAppOutput, app: AppDetail): Promise<TeardownAppOutput> {
  const prompt = buildStandardPrompt(app, base);
  // Cache key = the facts we fed (not the prompt envelope), so the cache invalidates
  // only when the underlying app facts move.
  const input = JSON.stringify({ v: 2, id: app.id, m: base.metrics, d: base.decisionPacket.decision, r: base.risks });
  try {
    const { value, cached } = await cachedGammaJson<Record<string, unknown>>(
      "teardown_standard",
      app.id,
      input,
      prompt,
      { temperature: 0.25 },
    );
    const n = normalizeNarrative(value);
    const label = INFERRED(cached);
    const agentSummary =
      `${n.thesis ? n.thesis + " " : ""}${base.identity.title} (${base.identity.category ?? "uncategorised"}, ${base.identity.store}): ` +
      `modelled ~${base.metrics.downloadsEstimate30d ?? "?"} downloads / ~${base.metrics.revenueEstimate30d ?? "?"} revenue (30d), ` +
      `${base.metrics.rating ?? "?"}★/${base.metrics.reviewCount.toLocaleString()} reviews. ${base.decisionPacket.decision} ` +
      `${n.audience ? "Audience: " + n.audience + " " : ""}Top risk: ${base.risks[0]} ` +
      `(depth: standard${cached ? ", cached" : ""}; clone difficulty ${n.cloneInsights?.cloneDifficulty ?? "?"}/5).`;
    return {
      ...base,
      depth: "standard",
      thesis: n.thesis,
      coreUserProblem: n.coreUserProblem,
      audience: n.audience,
      coreLoop: n.coreLoop,
      featureMap: n.featureMap,
      cloneInsights: n.cloneInsights,
      monetisation: { ...base.monetisation, summary: n.monetisationSummary },
      agentSummary,
      labels: {
        ...base.labels,
        thesis: label,
        coreUserProblem: label,
        audience: label,
        coreLoop: label,
        featureMap: label,
        cloneInsights: label,
        monetisation: { kind: "derived", note: "price + IAP facts; LLM summary" },
      },
    };
  } catch (err) {
    // Degrade honestly — serve the deterministic quick base, label why.
    console.warn(`[teardown] standard enrichment degraded for ${app.id}:`, err instanceof Error ? err.message : err);
    return {
      ...base,
      labels: {
        ...base.labels,
        thesis: DEGRADED,
        coreUserProblem: DEGRADED,
        audience: DEGRADED,
        coreLoop: DEGRADED,
        featureMap: DEGRADED,
        cloneInsights: DEGRADED,
      },
    };
  }
}

async function safeReviews(id: string): Promise<Review[]> {
  try {
    return await getAppReviews(id);
  } catch {
    return [];
  }
}

/**
 * Resolve a full teardown for an app id at the requested depth (clamped to what
 * this build implements). Returns `null` when the app is unknown (→ 404).
 */
export async function getAppTeardown(id: string, requestedDepth: TeardownDepth): Promise<TeardownAppOutput | null> {
  const app = await getAppById(id);
  if (!app) return null;
  const target: TeardownDepth = ORDER[requestedDepth] > ORDER[IMPLEMENTED_MAX] ? IMPLEMENTED_MAX : requestedDepth;

  const reviews = await safeReviews(id);
  const base = buildTeardownApp({ app, reviews, depth: target, observedAt: new Date().toISOString() });
  if (ORDER[target] >= ORDER.standard) return enrichStandard(base, app);
  return base;
}

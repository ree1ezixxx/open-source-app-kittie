/**
 * `teardown_app` service (Lane B) — orchestrates the depth ladder. `quick` is
 * the pure deterministic blueprint from `@kittie/intelligence` (NO LLM). `standard`
 * layers a cached Gemini Flash narrative (thesis, core problem, audience, core
 * loop, feature map, clone insights) on top; `deep` adds review clusters + a
 * vision screen-map. If Gemini is unconfigured or quota-exhausted, every LLM
 * section degrades to `quick` — never fabricates. All reasoning is on Flash
 * (one provider with `validate`), so there is no local-model dependency.
 */
import type { AppDetail, Review } from "@kittie/types";
import {
  buildTeardownApp,
  type AsoModel,
  type CloneInsights,
  type CoreLoop,
  type FeatureMap,
  type ReviewClusters,
  type ScreenMap,
  type SectionLabel,
  type TeardownAppOutput,
  type TeardownDepth,
} from "@kittie/intelligence";
import {
  cachedJson,
  fetchImageBase64,
  generate,
  generateVisionRaw,
  GEMINI_MODEL,
  isGeminiConfigured,
} from "../lib/gemini.js";
import { getAppById, getAppReviews } from "./app-service.js";

/** Highest depth this loop implements; higher requests clamp down (honest `depth`). */
const IMPLEMENTED_MAX: TeardownDepth = "deep";
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
  note: `${GEMINI_MODEL}${cached ? ", cached" : ""}`,
});
const DEGRADED: SectionLabel = { kind: "missing", note: "LLM unavailable (no key / quota) — quick depth served" };

async function enrichStandard(base: TeardownAppOutput, app: AppDetail): Promise<TeardownAppOutput> {
  // No key → skip the network call entirely and degrade to the deterministic base.
  if (!isGeminiConfigured()) return degradeStandard(base);
  const prompt = buildStandardPrompt(app, base);
  // Cache key = the facts we fed (not the prompt envelope), so the cache invalidates
  // only when the underlying app facts move.
  const input = JSON.stringify({ v: 2, id: app.id, m: base.metrics, d: base.decisionPacket.decision, r: base.risks });
  try {
    const { value, cached } = await cachedJson<Record<string, unknown>>("teardown_standard", app.id, input, () =>
      generate(prompt, { json: true, priority: "user" }),
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
    return degradeStandard(base);
  }
}

/** The deterministic quick base, with narrative sections labelled as degraded. */
function degradeStandard(base: TeardownAppOutput): TeardownAppOutput {
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

/* -------------------------------- deep -------------------------------- */

/** Deterministic ASO model: observed ad keywords + locale coverage (no LLM). */
function buildAso(app: AppDetail): AsoModel {
  const seen = new Set<string>();
  const keywords: AsoModel["keywords"] = [];
  for (const a of app.appleSearchAds) {
    if (seen.has(a.keyword)) continue;
    seen.add(a.keyword);
    keywords.push({ keyword: a.keyword, rank: a.rank, difficulty: null, opportunity: null });
    if (keywords.length >= 25) break;
  }
  return { languageCount: app.languages.length, languages: app.languages, keywords };
}

/** LLM-cluster raw review bodies into themes. Null when there are no reviews. */
async function clusterReviews(app: AppDetail, reviews: Review[]): Promise<ReviewClusters | null> {
  const sample = reviews.slice(0, 25);
  if (sample.length === 0 || !isGeminiConfigured()) return null;
  const bodies = sample.map((r) => ({ rating: r.rating, text: r.body.slice(0, 300) }));
  const prompt =
    "Cluster these mobile-app reviews into themes for a founder studying the app. " +
    "Return ONLY JSON {\"lovedThemes\":[],\"painThemes\":[],\"requestedFeatures\":[]} — each array exactly 3 short, concrete phrases drawn from the reviews (no fluff). " +
    `REVIEWS:\n${JSON.stringify(bodies)}`;
  const input = JSON.stringify({ v: 1, id: app.id, n: sample.length, ids: sample.map((r) => r.id).slice(0, 25) });
  try {
    const { value } = await cachedJson<Record<string, unknown>>("teardown_review_clusters", app.id, input, () =>
      generate(prompt, { json: true, priority: "user" }),
    );
    return {
      sampled: sample.length,
      lovedThemes: strArr(value.lovedThemes),
      painThemes: strArr(value.painThemes),
      requestedFeatures: strArr(value.requestedFeatures),
    };
  } catch (err) {
    console.warn(`[teardown] review clustering degraded for ${app.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Vision UI blueprint from the first listing screenshot. Best-effort — null on any failure. */
async function screenMapFromVision(app: AppDetail): Promise<ScreenMap | null> {
  const url = app.screenshotUrls[0];
  if (!url || !isGeminiConfigured()) return null;
  const prompt =
    "This is one screenshot from a mobile app's store listing. Return ONLY JSON " +
    '{"screens":[{"name":"","purpose":"","keyComponents":["","",""]}]} — describe THIS screen: a short name, its purpose in one phrase, and 3 key UI components visible. One screen object.';
  const input = JSON.stringify({ v: 1, id: app.id, url });
  try {
    const { value } = await cachedJson<Record<string, unknown>>("teardown_screenmap", app.id, input, async () =>
      generateVisionRaw(prompt, await fetchImageBase64(url)),
    );
    const screensRaw = Array.isArray(value.screens) ? value.screens : [];
    const screens = screensRaw
      .map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return { name: str(o.name) ?? "Screen", purpose: str(o.purpose) ?? "", keyComponents: strArr(o.keyComponents) };
      })
      .slice(0, 6);
    return screens.length ? { source: url, screens } : null;
  } catch (err) {
    console.warn(`[teardown] screen-map degraded for ${app.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function enrichDeep(base: TeardownAppOutput, app: AppDetail, reviews: Review[]): Promise<TeardownAppOutput> {
  const aso = buildAso(app);
  const [reviewClusters, screenMap] = await Promise.all([clusterReviews(app, reviews), screenMapFromVision(app)]);
  return {
    ...base,
    depth: "deep",
    aso,
    reviewClusters,
    screenMap,
    labels: {
      ...base.labels,
      aso: { kind: "observed", note: "observed ad keywords + listing locales" },
      reviewClusters: reviewClusters
        ? { kind: "inferred", note: `${GEMINI_MODEL}, cached` }
        : { kind: "missing", note: "no reviews to cluster, or LLM unavailable (no key / quota)" },
      screenMap: screenMap
        ? { kind: "inferred", note: `${GEMINI_MODEL} vision, cached` }
        : { kind: "missing", note: "no screenshot, or vision unavailable (no key / quota)" },
    },
  };
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
  let out = buildTeardownApp({ app, reviews, depth: target, observedAt: new Date().toISOString() });
  if (ORDER[target] >= ORDER.standard) out = await enrichStandard(out, app);
  if (ORDER[target] >= ORDER.deep) out = await enrichDeep(out, app, reviews);
  return out;
}

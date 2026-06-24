/**
 * validate_app_idea — orchestration. Composes find_similar_apps (competitor set)
 * with the pure scoring core and the canonical `synthesizeOpportunity` packet
 * builder into a `ValidateAppIdeaResult`.
 *
 * Honesty contract: the four §5.5 scores and the §5.6 verdict are DETERMINISTIC
 * (computed from observed competitor signals); the LLM is used ONLY for the
 * narrative (angle / MVP / risks), cached via `ai_generations`, and degrades to
 * null/[] on a Gemini quota error or when unconfigured. No fabricated metrics.
 */
import type {
  DecisionPacket,
  SimilarApp,
  ValidateAppIdeaInput,
  ValidateAppIdeaResult,
} from "@kittie/types";
import { getRecentReviewTagsForApps, getSnapshotContext } from "@kittie/db";
import {
  buildValidateAgentSummary,
  deriveVerdict,
  scoreIdea,
  summarizeCompetitors,
  synthesizeOpportunity,
  type MarketApp,
} from "@kittie/intelligence";
import { getDb } from "../lib/db.js";
import { findSimilarApps } from "./similar-apps-service.js";
import {
  GeminiDailyQuotaError,
  cachedGenerate,
  generate,
  hashInput,
  isGeminiConfigured,
} from "../lib/gemini.js";

/** Thrown for caller errors; the route maps `.status` to the HTTP code. */
export class ValidateIdeaError extends Error {
  constructor(
    message: string,
    readonly status: 400 = 400,
  ) {
    super(message);
    this.name = "ValidateIdeaError";
  }
}

/** Below this total competitor review count the catalog signal is too thin to judge. */
const THIN_EVIDENCE_REVIEWS = 50;

export async function validateAppIdea(
  input: ValidateAppIdeaInput,
): Promise<ValidateAppIdeaResult> {
  if (!input.idea || !input.idea.trim()) {
    throw new ValidateIdeaError("provide an `idea` (free text) to validate");
  }
  const db = getDb();

  // ── 1. Competitor set via find_similar_apps ──
  const similarResult = await findSimilarApps({
    query: input.idea,
    store: input.store,
    limit: 25,
  });
  const competitors = similarResult.similar;
  const interpretedIdea = similarResult.interpretedQuery;
  const directCount = competitors.filter((c) => c.similarityClass === "direct").length;

  // ── 2. Mine recurring competitor review themes (improvement areas = gaps) ──
  const reviewThemes = await mineReviewThemes(competitors);

  // ── 3. Deterministic §5.5 scores + §5.6 verdict ──
  const scores = scoreIdea({ competitors, directCount, reviewThemes });
  const totalReviews = competitors.reduce((s, c) => s + c.app.reviewCount, 0);
  const evidenceThin = competitors.length > 0 && totalReviews < THIN_EVIDENCE_REVIEWS;
  const verdict = deriveVerdict(scores, competitors.length, evidenceThin);

  // ── 4. observedAt + snapshotId — tie the packet to a real market snapshot ──
  const top = competitors[0];
  let observedAt = new Date().toISOString();
  let snapshotId = `validate:${observedAt.slice(0, 10)}`;
  if (top) {
    const ctx = await getSnapshotContext(db, top.app.id);
    if (ctx) {
      snapshotId = ctx.latest.id;
      observedAt = ctx.latest.createdAt.toISOString();
    }
  }

  // ── 5. Canonical DecisionPacket (reuse the honest synthesis) ──
  const marketApps: MarketApp[] = competitors.map((c) => ({
    id: c.app.id,
    store: c.app.store,
    title: c.app.title,
    rating: c.app.rating,
    reviewCount: c.app.reviewCount,
  }));
  const packet: DecisionPacket = synthesizeOpportunity({
    niche: interpretedIdea.summary,
    apps: marketApps,
    reviewThemes: reviewThemes.length ? reviewThemes : null,
    observedAt,
    snapshotId,
  });

  // ── 6. LLM narrative (cached, degrades on quota / unconfigured) ──
  const narrative = await generateNarrative(input.idea, verdict, scores, competitors, reviewThemes);

  // ── 7. Assemble ──
  return {
    interpretedIdea,
    competitors,
    competitorSummary: summarizeCompetitors(competitors, reviewThemes),
    scores,
    verdict,
    recommendedAngle: narrative.angle,
    mvp: narrative.mvp,
    risks: narrative.risks,
    packet,
    agentSummary: buildValidateAgentSummary(
      input.idea,
      verdict,
      scores,
      competitors,
      narrative.angle,
    ),
  };
}

/**
 * Improvement-area themes across the competitor set, ranked by how many
 * competitors raise each (so shared complaints dominate when review coverage is
 * rich, while a single competitor's complaints still register as gaps when it is
 * the only one with ingested reviews). Top 6.
 */
async function mineReviewThemes(competitors: SimilarApp[]): Promise<string[]> {
  const ids = competitors.slice(0, 20).map((c) => c.app.id);
  if (!ids.length) return [];
  const tags = await getRecentReviewTagsForApps(getDb(), ids, 50);
  const freq = new Map<string, number>();
  for (const t of tags.values()) {
    for (const area of t.improvementAreas) freq.set(area, (freq.get(area) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);
}

interface Narrative {
  angle: string | null;
  mvp: string[];
  risks: string[];
}

/** LLM narrative (angle/MVP/risks). Cached by idea; degrades cleanly — never throws. */
async function generateNarrative(
  idea: string,
  verdict: string,
  scores: unknown,
  competitors: SimilarApp[],
  themes: string[],
): Promise<Narrative> {
  const fallbackRisks = themes.length
    ? [`Competitors are dinged for: ${themes.slice(0, 3).join(", ")} — get these right.`]
    : [];
  if (!isGeminiConfigured()) return { angle: null, mvp: [], risks: fallbackRisks };

  const topTitles = competitors.slice(0, 8).map((c) => c.app.title);
  const prompt =
    `You are an app-market strategist. Given this analysis JSON, respond with STRICT JSON ` +
    `{"angle": string, "mvp": string[], "risks": string[]}: angle = one-sentence differentiation ` +
    `angle; mvp = 3-5 must-have launch features; risks = 2-4 concrete risks. Ground every item in ` +
    `the data; do not invent metrics. Analysis: ` +
    JSON.stringify({ idea, verdict, scores, competitors: topTitles, complaints: themes });

  try {
    const { output } = await cachedGenerate("idea-validation", hashInput(idea), prompt, () =>
      generate(prompt, { json: true, priority: "user" }),
    );
    const text = output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(text) as Partial<Narrative>;
    return {
      angle: typeof parsed.angle === "string" ? parsed.angle : null,
      mvp: Array.isArray(parsed.mvp)
        ? parsed.mvp.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [],
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.filter((x): x is string => typeof x === "string").slice(0, 5)
        : fallbackRisks,
    };
  } catch (err) {
    if (!(err instanceof GeminiDailyQuotaError)) {
      console.error("validate_app_idea narrative failed:", err);
    }
    return { angle: null, mvp: [], risks: fallbackRisks };
  }
}

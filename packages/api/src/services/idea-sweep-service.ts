import {
  countIdeas,
  countSnapshotDays,
  insertIdea,
  listComplaintSnippets,
  listIdeaCandidates,
  listStaleIdeaCandidates,
  updateIdeaBlueprint,
  type Db,
  type IdeaCandidate,
  type StaleIdeaCandidate,
} from "@kittie/db";

import { getDb } from "../lib/db.js";
import {
  GeminiDailyQuotaError,
  GEMINI_BATCH_MODEL,
  generateJson,
  isGeminiConfigured,
} from "../lib/gemini.js";
import {
  BLUEPRINT_SCHEMA_VERSION,
  isBlueprintFresh,
  normalizeBlueprint,
  parseMarketing,
  parseOpportunity,
  type IdeaMarketing,
  type IdeaOpportunity,
} from "./idea-blueprint.js";
import { selectIdeaSources } from "./idea-gate.js";

/* ============================================================
   Hot-ideas generation sweep (ADR 0005): batch-generate → store →
   refresh on cadence. ONE Gemini call yields ideas for several
   source apps, so throughput is ideas-per-request, not 1:1 — the
   only real limiter is the model's daily request quota, and the
   sweep runs until that (or the slice cap) stops it.
   ============================================================ */

export const IDEAS_TARGET = 1_200;
/** Source apps folded into one Gemini request — 8× quota efficiency. */
const SOURCES_PER_CALL = 8;
/** Per-run ceiling; on a quota-rich key one run can close most of the gap. */
const IDEAS_PER_RUN = 320;

export interface IdeaSweepResult {
  existing: number;
  generated: number;
  failed: number;
  target: number;
}

interface GeneratedIdea {
  sourceIndex: number;
  title: string;
  summary: string;
  ideaCategory: string;
  needsBackend: boolean;
  needsDatabase: boolean;
  needsAi: boolean;
  blueprint: {
    difficulty: string;
    difficultyReasoning: string;
    timelineWeeks: number;
    requirements: string[];
    mvpFeatures: string[];
    keyFeatures: string[];
    v2Features: string[];
    architecture: string;
    techStack: string[];
    mvpScope: string;
    thirdPartyServices: string[];
  };
  opportunity: IdeaOpportunity;
  marketing: IdeaMarketing;
}

const IDEA_CATEGORIES = [
  "AI Tool",
  "Automation",
  "Content",
  "Marketplace",
  "Social",
  "Tracker",
  "Wellness",
  "Utility",
  "Game",
] as const;

const IDEA_SCHEMA = {
  type: "object",
  properties: {
    sourceIndex: {
      type: "integer",
      description: "Index of the source app this idea derives from (matches the numbered list)",
    },
    title: { type: "string", description: "Concise product name for the new app idea" },
    summary: {
      type: "string",
      description: "2-3 sentence card description of the idea and who it serves",
    },
    ideaCategory: { type: "string", enum: [...IDEA_CATEGORIES] },
    needsBackend: { type: "boolean" },
    needsDatabase: { type: "boolean" },
    needsAi: { type: "boolean" },
    blueprint: {
      type: "object",
      properties: {
        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        difficultyReasoning: { type: "string" },
        timelineWeeks: { type: "integer" },
        requirements: { type: "array", items: { type: "string" } },
        mvpFeatures: { type: "array", items: { type: "string" } },
        keyFeatures: { type: "array", items: { type: "string" } },
        v2Features: { type: "array", items: { type: "string" } },
        architecture: { type: "string" },
        techStack: { type: "array", items: { type: "string" } },
        mvpScope: { type: "string" },
        thirdPartyServices: { type: "array", items: { type: "string" } },
      },
      required: [
        "difficulty",
        "difficultyReasoning",
        "timelineWeeks",
        "requirements",
        "mvpFeatures",
        "keyFeatures",
        "v2Features",
        "architecture",
        "techStack",
        "mvpScope",
        "thirdPartyServices",
      ],
    },
    opportunity: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence opportunity thesis for the new idea" },
        whyThisApp: { type: "string", description: "Why this specific source app is worth deriving from" },
        marketSizeInsight: { type: "string", description: "Qualitative read on how big the demand is" },
        painPoints: { type: "array", items: { type: "string" }, description: "Real user pain points (from the complaints)" },
        featureGaps: { type: "array", items: { type: "string" }, description: "Gaps in the incumbent a new app can win on" },
        targetAudience: { type: "string" },
        monetizationStrategy: { type: "string" },
        competitiveAdvantages: { type: "array", items: { type: "string" } },
      },
      required: [
        "summary",
        "whyThisApp",
        "marketSizeInsight",
        "painPoints",
        "featureGaps",
        "targetAudience",
        "monetizationStrategy",
        "competitiveAdvantages",
      ],
    },
    marketing: {
      type: "object",
      properties: {
        marketingStrategy: { type: "string", description: "Overall go-to-market / growth approach" },
        marketingPlatforms: { type: "array", items: { type: "string" } },
        contentHooks: { type: "array", items: { type: "string" }, description: "Concrete post/ad angles" },
        ugcFormats: { type: "array", items: { type: "string" } },
        campaignIdeas: { type: "array", items: { type: "string" } },
        creatorTypes: { type: "array", items: { type: "string" } },
        keySellingPoints: { type: "array", items: { type: "string" } },
        asoKeywords: { type: "array", items: { type: "string" }, description: "Seed ASO keywords for the listing" },
        goToMarket: { type: "string", description: "Sequenced launch plan" },
      },
      required: [
        "marketingStrategy",
        "marketingPlatforms",
        "contentHooks",
        "ugcFormats",
        "campaignIdeas",
        "creatorTypes",
        "keySellingPoints",
        "asoKeywords",
        "goToMarket",
      ],
    },
  },
  required: [
    "sourceIndex",
    "title",
    "summary",
    "ideaCategory",
    "needsBackend",
    "needsDatabase",
    "needsAi",
    "blueprint",
    "opportunity",
    "marketing",
  ],
};

const BATCH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ideas: { type: "array", items: IDEA_SCHEMA },
  },
  required: ["ideas"],
};

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildBatchPrompt(sources: Array<{ c: IdeaCandidate; complaints: string[] }>): string {
  const lines = [
    "You are an app-opportunity analyst. For EACH numbered source app below, derive ONE new app concept.",
    "Each concept must serve the same proven demand as its source but be a DIFFERENT product — not a clone.",
    "Every concept must be distinct from the others in this batch.",
  ];
  sources.forEach(({ c, complaints }, i) => {
    lines.push(
      "",
      `=== Source app ${i} ===`,
      `Name: ${c.title}`,
      `Category: ${c.category ?? "Unknown"}`,
      `Store rating: ${c.rating ?? "n/a"} from ${c.reviewCount} reviews`,
      `Estimated monthly revenue (modeled): $${c.revenueEstimate ?? 0}`,
      `Price: ${c.price ? `$${c.price}` : "free"}`,
    );
    if (c.description) lines.push(`Listing description: ${c.description.slice(0, 280)}`);
    if (complaints.length) {
      lines.push("User complaints (low-rating reviews) — weight the concept toward fixing these:");
      for (const s of complaints) lines.push(`- ${s}`);
    }
  });
  lines.push(
    "",
    `Return JSON: { "ideas": [...] } with EXACTLY ${sources.length} entries, one per source app,`,
    "each with its sourceIndex (0-based, matching the numbering above), a concise title, a 2-3",
    "sentence summary, an ideaCategory from the allowed list, the three blueprint need flags, and:",
    "1. blueprint — difficulty + reasoning, timelineWeeks, requirements, MVP/key/V2 features,",
    "   architecture, techStack, mvpScope, thirdPartyServices. Concrete and buildable by a solo dev.",
    "2. opportunity — summary, whyThisApp, marketSizeInsight, painPoints (ground these in the source",
    "   app's complaints above), featureGaps, targetAudience, monetizationStrategy, competitiveAdvantages.",
    "3. marketing — marketingStrategy, marketingPlatforms, contentHooks, ugcFormats, campaignIdeas,",
    "   creatorTypes, keySellingPoints, asoKeywords, goToMarket. Specific and actionable, not generic.",
  );
  return lines.join("\n");
}

/** v2 blueprint JSON: building plan (flat) + validated opportunity + marketing,
 *  version-stamped so the catalog-upgrade sweep can spot legacy rows. */
function buildBlueprintJson(idea: GeneratedIdea): string {
  return JSON.stringify({
    ...idea.blueprint,
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    opportunity: parseOpportunity(idea.opportunity),
    marketing: parseMarketing(idea.marketing),
  });
}

/** Regenerated content shared by insert (new idea) and update (legacy upgrade). */
function ideaContentFields(idea: GeneratedIdea) {
  return {
    title: idea.title,
    summary: idea.summary,
    ideaCategory: idea.ideaCategory,
    needsBackend: idea.needsBackend,
    needsDatabase: idea.needsDatabase,
    needsAi: idea.needsAi,
    blueprint: buildBlueprintJson(idea),
  };
}

/**
 * Generate ideas for a list of source apps in Gemini-batched calls, persisting
 * each via `persist`. Shared by new-idea generation (insert) and the catalog
 * upgrade (update). One bad idea never aborts the slice; a daily-quota error or
 * persistent model trouble stops cleanly so the next run resumes.
 */
async function runIdeaBatches<T extends IdeaCandidate>(
  db: Db,
  sources: T[],
  model: string,
  persist: (idea: GeneratedIdea, source: T) => Promise<void>,
): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (let at = 0; at < sources.length; at += SOURCES_PER_CALL) {
    const chunk = sources.slice(at, at + SOURCES_PER_CALL);
    try {
      const withComplaints = await Promise.all(
        chunk.map(async (c) => ({ c, complaints: await listComplaintSnippets(db, c.appId) })),
      );
      const result = await generateJson<{ ideas: GeneratedIdea[] }>(buildBatchPrompt(withComplaints), {
        responseSchema: BATCH_RESPONSE_SCHEMA,
        priority: "batch", // never make a person wait behind this sweep
        model, // default: separate daily quota bucket
      });
      for (const idea of result.ideas ?? []) {
        const source = chunk[idea.sourceIndex];
        if (!source || !idea.title) {
          failed++;
          continue;
        }
        await persist(idea, source);
        done++;
      }
    } catch (e) {
      if (e instanceof GeminiDailyQuotaError) {
        console.warn(`[hot-ideas] ${e.message}; pausing at ${done}`);
        break;
      }
      failed += chunk.length;
      console.warn(
        `[hot-ideas] batch of ${chunk.length} (from ${chunk[0]?.title}) failed:`,
        e instanceof Error ? e.message : e,
      );
      if (failed >= SOURCES_PER_CALL * 3 && done === 0) break;
    }
  }
  return { done, failed };
}

/**
 * Upgrade legacy ideas (blueprint predates the current schema — missing
 * opportunity/marketing) in place, capped at `maxIdeas`. Rewrites the content
 * but keeps the row id/slug/sourceAppId, so the storeAppId-keyed detail URL holds.
 */
/** Pure selection: of the idea candidates, the ones whose stored blueprint is
 *  NOT yet at the current schema (missing opportunity/marketing), capped. Pure
 *  + exported so the upgrade-selection logic is unit-testable without a DB/LLM. */
export function selectStaleForUpgrade(
  candidates: StaleIdeaCandidate[],
  maxIdeas: number,
): StaleIdeaCandidate[] {
  return candidates
    .filter((c) => !isBlueprintFresh(normalizeBlueprint(c.blueprint)))
    .slice(0, Math.max(0, maxIdeas));
}

export async function upgradeStaleIdeas(
  db: Db,
  maxIdeas: number,
  model = GEMINI_BATCH_MODEL,
): Promise<{ upgraded: number; failed: number }> {
  const stale = selectStaleForUpgrade(await listStaleIdeaCandidates(db), maxIdeas);
  if (stale.length === 0) return { upgraded: 0, failed: 0 };
  const r = await runIdeaBatches<StaleIdeaCandidate>(db, stale, model, async (idea, source) => {
    await updateIdeaBlueprint(db, source.ideaId, ideaContentFields(idea));
  });
  return { upgraded: r.done, failed: r.failed };
}

/** One paced slice: generate ideas for new sources up to target, then spend any
 *  leftover budget upgrading legacy ideas in place. Safe to re-run. */
export async function sweepHotIdeas(
  maxIdeas = IDEAS_PER_RUN,
  model = GEMINI_BATCH_MODEL,
): Promise<IdeaSweepResult> {
  const db = getDb();
  const existing = await countIdeas(db);
  if (!isGeminiConfigured()) {
    return { existing, generated: 0, failed: 0, target: IDEAS_TARGET };
  }

  let newCount = 0;
  let upgraded = 0;
  let failed = 0;

  // Phase A — generate for new sources until the catalog target is met.
  const remaining = IDEAS_TARGET - existing;
  if (remaining > 0) {
    const [candidates, snapshotDays] = await Promise.all([
      listIdeaCandidates(db),
      countSnapshotDays(db),
    ]);
    const slice = Math.min(maxIdeas, remaining);
    const sources = selectIdeaSources(candidates, snapshotDays, slice, Date.now());
    const r = await runIdeaBatches<IdeaCandidate>(db, sources, model, async (idea, source) => {
      await insertIdea(db, {
        sourceAppId: source.appId,
        slug: slugify(idea.title) || `idea-${source.storeAppId}`,
        sourceCategory: source.category ?? "Other",
        ...ideaContentFields(idea),
        reviewCount: source.reviewCount,
        rating: source.rating,
        downloadsEstimate: source.downloadsEstimate,
        revenueEstimate: source.revenueEstimate,
        price: source.price,
        releasedAt: source.releasedAt,
      });
    });
    newCount = r.done;
    failed += r.failed;
  }

  // Phase B — upgrade legacy (pre-v2) ideas in place with any leftover budget.
  const budgetLeft = maxIdeas - newCount;
  if (budgetLeft > 0) {
    const up = await upgradeStaleIdeas(db, budgetLeft, model);
    upgraded = up.upgraded;
    failed += up.failed;
  }

  return {
    existing: existing + newCount,
    generated: newCount + upgraded,
    failed,
    target: IDEAS_TARGET,
  };
}

export const HOT_IDEAS_MODEL = GEMINI_BATCH_MODEL;

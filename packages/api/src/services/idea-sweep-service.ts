import {
  countIdeas,
  countSnapshotDays,
  insertIdea,
  listComplaintSnippets,
  listIdeaCandidates,
  type IdeaCandidate,
} from "@kittie/db";

import { getDb } from "../lib/db.js";
import {
  GeminiDailyQuotaError,
  GEMINI_BATCH_MODEL,
  generateJson,
  isGeminiConfigured,
} from "../lib/gemini.js";
import { selectIdeaSources } from "./idea-gate.js";

/* ============================================================
   Hot-ideas generation sweep (ADR 0005): batch-generate → store →
   refresh on cadence. Each run generates one paced slice; the full
   set (~1,200, matching live) accrues over ~a week of runs. The
   Gemini client's global rate gate paces the calls.
   ============================================================ */

export const IDEAS_TARGET = 1_200;
const IDEAS_PER_RUN = 75;

export interface IdeaSweepResult {
  existing: number;
  generated: number;
  failed: number;
  target: number;
}

interface GeneratedIdea {
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

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
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
  },
  required: ["title", "summary", "ideaCategory", "needsBackend", "needsDatabase", "needsAi", "blueprint"],
};

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildPrompt(c: IdeaCandidate, complaints: string[]): string {
  const lines = [
    "You are an app-opportunity analyst. Derive ONE new app concept from this real, fast-growing app.",
    "The concept must serve the same proven demand but be a DIFFERENT product — not a clone of the source app.",
    "",
    `Source app: ${c.title}`,
    `Category: ${c.category ?? "Unknown"}`,
    `Store rating: ${c.rating ?? "n/a"} from ${c.reviewCount} reviews`,
    `Estimated monthly revenue (modeled): $${c.revenueEstimate ?? 0}`,
    `Price: ${c.price ? `$${c.price}` : "free"}`,
  ];
  if (c.description) lines.push(`Listing description: ${c.description.slice(0, 400)}`);
  if (complaints.length) {
    lines.push("", "What its users complain about (low-rating reviews):");
    for (const s of complaints) lines.push(`- ${s}`);
    lines.push("Weight the concept toward fixing these gaps.");
  }
  lines.push(
    "",
    "Return JSON matching the schema: a concise title, a 2-3 sentence summary,",
    "an ideaCategory from the allowed list, the three blueprint need flags, and a full",
    "blueprint (difficulty + reasoning, timelineWeeks, requirements, MVP/key/V2 features,",
    "architecture, techStack, mvpScope, thirdPartyServices). Keep features concrete and buildable by a solo dev.",
  );
  return lines.join("\n");
}

/** One paced slice of idea generation. Safe to re-run; one failure never aborts the slice. */
export async function sweepHotIdeas(): Promise<IdeaSweepResult> {
  const db = getDb();
  const existing = await countIdeas(db);
  if (!isGeminiConfigured() || existing >= IDEAS_TARGET) {
    return { existing, generated: 0, failed: 0, target: IDEAS_TARGET };
  }

  const [candidates, snapshotDays] = await Promise.all([
    listIdeaCandidates(db),
    countSnapshotDays(db),
  ]);
  const slice = Math.min(IDEAS_PER_RUN, IDEAS_TARGET - existing);
  const sources = selectIdeaSources(candidates, snapshotDays, slice, Date.now());

  let generated = 0;
  let failed = 0;
  for (const source of sources) {
    try {
      const complaints = await listComplaintSnippets(db, source.appId);
      const idea = await generateJson<GeneratedIdea>(buildPrompt(source, complaints), {
        responseSchema: RESPONSE_SCHEMA,
        priority: "batch", // never make a person wait behind this sweep
        model: GEMINI_BATCH_MODEL, // separate (larger) daily quota bucket
      });
      await insertIdea(db, {
        sourceAppId: source.appId,
        slug: slugify(idea.title) || `idea-${source.storeAppId}`,
        title: idea.title,
        summary: idea.summary,
        sourceCategory: source.category ?? "Other",
        ideaCategory: idea.ideaCategory,
        needsBackend: idea.needsBackend,
        needsDatabase: idea.needsDatabase,
        needsAi: idea.needsAi,
        blueprint: JSON.stringify(idea.blueprint),
        reviewCount: source.reviewCount,
        rating: source.rating,
        downloadsEstimate: source.downloadsEstimate,
        revenueEstimate: source.revenueEstimate,
        price: source.price,
        releasedAt: source.releasedAt,
      });
      generated++;
    } catch (e) {
      if (e instanceof GeminiDailyQuotaError) {
        // Today's budget is spent — stop immediately, the next due run resumes.
        console.warn(`[hot-ideas] ${e.message}; pausing slice`);
        break;
      }
      failed++;
      console.warn(
        `[hot-ideas] ${source.title} (${source.appId}) failed:`,
        e instanceof Error ? e.message : e,
      );
      // Persistent model trouble: stop the slice, next run retries.
      if (failed >= 5 && generated === 0) break;
    }
  }

  return { existing: existing + generated, generated, failed, target: IDEAS_TARGET };
}

export const HOT_IDEAS_MODEL = GEMINI_BATCH_MODEL;

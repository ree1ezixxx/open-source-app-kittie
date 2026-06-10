import { randomUUID } from "node:crypto";

import {
  getJobCursor,
  ideaFeedStats,
  ideatedSourceApps,
  ideasTableExists,
  insertOrReplaceIdea,
  listIdeaCandidateApps,
  listMinableReviews,
  reviewTextByIds,
  saveJobCursor,
  type IdeaCandidateApp,
} from "@kittie/db";
import { mineNiche, type MinableReview, type MinedCluster } from "@kittie/intelligence";

import { getDb } from "../lib/db.js";
import { generateText, seamStatus } from "./llm-seam.js";

/* ============================================================
   Autonomous idea generator (additive lane) — clones AppKittie's
   Hot Ideas logic so the feed stays LIVE as markets move:

     1. Pick today's proven-demand-but-flawed apps from the latest
        snapshots (high revenue + rising + real review volume + a
        low rating — their "$50k/mo, sort rating low→high").
     2. Mine each one's complaints/requests into themed clusters
        (the "product roadmap written by your customers").
     3. Ask the LLM seam to draft a grounded concept + full build
        blueprint, shaped exactly like the parity app_ideas rows.
     4. Upsert into app_ideas, keyed by source app, refreshing
        stale ideas — so next week's risers surface new ideas.

   Honesty: with no GEMINI_API_KEY the run is a cheap no-op that
   records a dormant status; the existing real ideas still show,
   nothing is fabricated. Quota-frugal: a small batch per run, and
   a null seam response (quota/network) stops the batch immediately.
   ============================================================ */

const CURSOR_ID = "idea-generator";
/** Don't re-spend an LLM call on an app ideated within this window. */
const FRESHNESS_DAYS = 14;
/** Ideas per run — free Gemini keys allow ~20 calls/day/model. */
const DEFAULT_BATCH = 4;
const RATING_CEILING = 4.0;
const MIN_REVIEWS = 200;
/** Need at least this many mined reviews to ground a concept honestly. */
const MIN_REVIEWS_TO_MINE = 8;

export interface IdeaGenStatus {
  lastRunAt: number | null;
  lastGenerated: number;
  totalIdeas: number;
  latestIdeaAt: number | null;
  dormantReason: string | null;
}

interface CursorState {
  lastRunAt: number | null;
  lastGenerated: number;
  dormantReason: string | null;
}

async function readCursor(): Promise<CursorState> {
  const raw = await getJobCursor(getDb(), CURSOR_ID);
  if (!raw) return { lastRunAt: null, lastGenerated: 0, dormantReason: null };
  try {
    const v = JSON.parse(raw) as Partial<CursorState>;
    return {
      lastRunAt: typeof v.lastRunAt === "number" ? v.lastRunAt : null,
      lastGenerated: typeof v.lastGenerated === "number" ? v.lastGenerated : 0,
      dormantReason: typeof v.dormantReason === "string" ? v.dormantReason : null,
    };
  } catch {
    return { lastRunAt: null, lastGenerated: 0, dormantReason: null };
  }
}

async function writeCursor(state: CursorState): Promise<void> {
  await saveJobCursor(getDb(), CURSOR_ID, JSON.stringify(state));
}

export async function ideaGenStatus(): Promise<IdeaGenStatus> {
  const [cursor, feed] = await Promise.all([readCursor(), ideaFeedStats(getDb())]);
  return {
    lastRunAt: cursor.lastRunAt,
    lastGenerated: cursor.lastGenerated,
    totalIdeas: feed.count,
    latestIdeaAt: feed.latestCreatedAt,
    dormantReason: cursor.dormantReason,
  };
}

/* -------------------------------------------------- concept drafting */

interface Blueprint {
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
}

interface Concept {
  title: string;
  summary: string;
  ideaCategory: string;
  needsBackend: boolean;
  needsDatabase: boolean;
  needsAi: boolean;
  blueprint: Blueprint;
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

/** Extract the first balanced JSON object from a model response (tolerates
    ```json fences and surrounding prose). */
function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clusterLine(c: MinedCluster): string {
  const kind = c.kind === "request" ? "request" : "complaint";
  return `- [${kind}] ${c.label} — ${c.count} reviews, avg ${c.avgRating.toFixed(1)}★`;
}

function buildPrompt(
  app: IdeaCandidateApp,
  pain: MinedCluster[],
  evidence: Array<{ title: string | null; body: string | null; rating: number }>,
): string {
  const revenue = app.revenueEstimate != null ? `~$${app.revenueEstimate.toLocaleString()}/mo (estimated)` : "unknown";
  const snippets = evidence
    .slice(0, 8)
    .map((e) => `  • ${e.rating}★ "${(e.title ? `${e.title}: ` : "") + (e.body ?? "")}"`.slice(0, 240))
    .join("\n");

  return [
    "You are an app-opportunity analyst. A proven app has real demand but unhappy users — design the better version people are asking for in its reviews.",
    "",
    `SOURCE APP: "${app.title}"`,
    `Category: ${app.category ?? "unknown"}`,
    `Revenue: ${revenue}. Reviews: ${app.reviewCount}. Rating: ${app.rating != null ? app.rating.toFixed(2) : "?"}/5 (low — users are frustrated).`,
    "",
    "RECURRING PAIN FROM ITS REVIEWS (mined):",
    pain.map(clusterLine).join("\n") || "- (sparse)",
    "",
    "EVIDENCE SNIPPETS (verbatim):",
    snippets || "  (none)",
    "",
    "Design a NEW app that directly fixes these gaps. Ground every choice in the pain above — do not invent unrelated features.",
    "Return ONLY minified JSON (no markdown, no prose) with EXACTLY these keys:",
    '{"title":string,"summary":string(2-3 sentences naming the gap it fixes),"ideaCategory":string(e.g. "AI Tool","Tracker","Marketplace","Wellness","Automation","Social","Content"),"needsBackend":boolean,"needsDatabase":boolean,"needsAi":boolean,"blueprint":{"difficulty":"low"|"medium"|"high","difficultyReasoning":string,"timelineWeeks":number,"requirements":string[],"mvpFeatures":string[],"keyFeatures":string[],"v2Features":string[],"architecture":string,"techStack":string[],"mvpScope":string,"thirdPartyServices":string[]}}',
  ].join("\n");
}

type DraftResult = { kind: "concept"; concept: Concept } | { kind: "skip" } | { kind: "stop" };

async function draftConcept(
  app: IdeaCandidateApp,
  pain: MinedCluster[],
  evidence: Array<{ title: string | null; body: string | null; rating: number }>,
): Promise<DraftResult> {
  const raw = await generateText(buildPrompt(app, pain, evidence), { maxOutputTokens: 2048 });
  // null = seam disabled, quota, or network — stop spending this run.
  if (raw === null) return { kind: "stop" };

  const parsed = extractJson(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") return { kind: "skip" };

  const title = asString(parsed.title);
  const summary = asString(parsed.summary);
  if (!title || !summary) return { kind: "skip" };

  const bpRaw = (parsed.blueprint ?? {}) as Record<string, unknown>;
  const timeline = Number(bpRaw.timelineWeeks);
  const concept: Concept = {
    title: title.slice(0, 120),
    summary: summary.slice(0, 1200),
    ideaCategory: asString(parsed.ideaCategory, "AI Tool"),
    needsBackend: parsed.needsBackend === true,
    needsDatabase: parsed.needsDatabase === true,
    needsAi: parsed.needsAi === true,
    blueprint: {
      difficulty: asString(bpRaw.difficulty, "medium"),
      difficultyReasoning: asString(bpRaw.difficultyReasoning),
      timelineWeeks: Number.isFinite(timeline) && timeline > 0 ? Math.round(timeline) : 12,
      requirements: asArray(bpRaw.requirements),
      mvpFeatures: asArray(bpRaw.mvpFeatures),
      keyFeatures: asArray(bpRaw.keyFeatures),
      v2Features: asArray(bpRaw.v2Features),
      architecture: asString(bpRaw.architecture),
      techStack: asArray(bpRaw.techStack),
      mvpScope: asString(bpRaw.mvpScope),
      thirdPartyServices: asArray(bpRaw.thirdPartyServices),
    },
  };
  return { kind: "concept", concept };
}

/* -------------------------------------------------- mining helpers */

function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `idea-${Date.now()}`
  );
}

/* -------------------------------------------------- the run */

export async function runIdeaGeneration(
  opts: { limit?: number } = {},
): Promise<{ ran: boolean; generated: number; scanned: number; reason?: string }> {
  const db = getDb();

  if (!seamStatus().enabled) {
    const reason = "GEMINI_API_KEY not set — generator dormant";
    await writeCursor({ lastRunAt: Date.now(), lastGenerated: 0, dormantReason: reason });
    return { ran: false, generated: 0, scanned: 0, reason };
  }
  if (!(await ideasTableExists(db))) {
    return { ran: false, generated: 0, scanned: 0, reason: "app_ideas table absent" };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_BATCH, 20));
  const freshCutoffSec = Math.floor((Date.now() - FRESHNESS_DAYS * 86_400_000) / 1000);

  const [candidates, ideated] = await Promise.all([
    listIdeaCandidateApps(db, { ratingCeiling: RATING_CEILING, minReviews: MIN_REVIEWS, limit: limit * 6 }),
    ideatedSourceApps(db),
  ]);

  // Skip apps whose idea is still fresh; stale or never-ideated are eligible.
  const eligible = candidates.filter((c) => {
    const at = ideated.get(c.id);
    return at == null || at < freshCutoffSec;
  });

  let generated = 0;
  let scanned = 0;
  for (const app of eligible) {
    if (generated >= limit) break;
    scanned++;

    const reviewRows = await listMinableReviews(db, [app.id], 400);
    if (reviewRows.length < MIN_REVIEWS_TO_MINE) continue;

    const minable: MinableReview[] = reviewRows.map((r) => ({
      id: r.id,
      appId: r.appId,
      rating: r.rating,
      sentiment: r.sentiment,
      topics: parseJsonArray(r.topics),
      improvementAreas: parseJsonArray(r.improvementAreas),
      reviewedAt: r.reviewedAt,
    }));

    const report = mineNiche(minable, { maxClusters: 10, minCount: 2 });
    const pain = report.clusters.filter((c) => c.kind !== "praise").slice(0, 6);
    if (pain.length === 0) continue; // no grounded gap → don't invent one

    const evidenceIds = pain.flatMap((c) => c.evidenceReviewIds).slice(0, 8);
    const evidence = await reviewTextByIds(db, evidenceIds);

    const result = await draftConcept(app, pain, evidence);
    if (result.kind === "stop") break; // quota / seam down — stop the batch
    if (result.kind === "skip") continue;

    const { concept } = result;
    await insertOrReplaceIdea(db, {
      id: randomUUID(),
      sourceAppId: app.id,
      slug: slugify(concept.title),
      title: concept.title,
      summary: concept.summary,
      sourceCategory: app.category ?? "Unknown",
      ideaCategory: concept.ideaCategory,
      needsBackend: concept.needsBackend,
      needsDatabase: concept.needsDatabase,
      needsAi: concept.needsAi,
      blueprint: JSON.stringify(concept.blueprint),
      reviewCount: app.reviewCount,
      rating: app.rating,
      downloadsEstimate: app.downloadsEstimate,
      revenueEstimate: app.revenueEstimate,
      price: app.price,
      releasedAt: app.releasedAt,
      createdAt: Math.floor(Date.now() / 1000),
    });
    generated++;
  }

  await writeCursor({ lastRunAt: Date.now(), lastGenerated: generated, dormantReason: null });
  return { ran: true, generated, scanned };
}

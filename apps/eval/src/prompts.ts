/**
 * The 6 fixed golden prompts (ticket #101) as shadow-mode intervention runners.
 *
 * Each prompt resolves ONE product decision. Its `run` issues the MCP calls Kittie would make
 * to ground that decision, threading discovered ids/keywords forward through a BuildContext —
 * exactly how a coding agent chains tool calls (one result informs the next). We OBSERVE the
 * calls; we never force the agent to act on them.
 *
 * `accepts` is keyed on the SUBSTANTIVE tools for each decision, so a decision is only
 * "market-backed accepted" when the real market evidence actually came back — trivial
 * supporting calls (coverage lists, seed lookups) never inflate acceptance.
 */
import type { McpHarness } from "./mcp-client.js";
import type { BuildScenario, DecisionSpec, ToolCallRecord } from "./types.js";

export interface BuildContext {
  topAppId?: string;
  topAppTitle?: string;
  relatedKeywords: string[];
}

export interface GoldenPrompt {
  id: string;
  text: (s: BuildScenario) => string;
  decision: DecisionSpec;
  run: (h: McpHarness, s: BuildScenario, ctx: BuildContext) => Promise<ToolCallRecord[]>;
}

/** Acceptance: at least one substantive tool returned usable evidence. */
function acceptsFromTools(...tools: string[]): DecisionSpec["accepts"] {
  const key = new Set(tools);
  return (records) => records.some((r) => r.relevant && key.has(r.tool));
}

// ─── data extraction helpers ──────────────────────────────────────────────────

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["data", "items", "results", "apps", "keywords", "rows"]) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function extractTopApp(data: unknown): { id: string; title: string } | undefined {
  for (const item of asArray(data)) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const id = o.id ?? o.appId;
      if (typeof id === "string" && id.length > 0) {
        const title = o.title ?? o.name ?? o.appName ?? o.developer ?? id;
        return { id, title: String(title) };
      }
    }
  }
  return undefined;
}

function extractKeywords(data: unknown, max: number): string[] {
  const out: string[] = [];
  for (const item of asArray(data)) {
    if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const kw = o.keyword ?? o.term ?? o.text ?? o.value;
      if (typeof kw === "string") out.push(kw);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Issue one planned call, record it, return parsed data for threading. */
async function fire(
  h: McpHarness,
  recs: ToolCallRecord[],
  decision: string,
  tool: string,
  args: Record<string, unknown>,
  intent: string,
): Promise<unknown> {
  const { record, data } = await h.call({ tool, args, decision, intent });
  recs.push(record);
  return data;
}

/** Make sure we have an incumbent to reason about; discover one if an earlier prompt didn't. */
async function ensureTopApp(
  h: McpHarness,
  recs: ToolCallRecord[],
  s: BuildScenario,
  ctx: BuildContext,
  decision: string,
): Promise<void> {
  if (ctx.topAppId) return;
  const data = await fire(h, recs, decision, "search_apps", {
    search: s.seedKeyword,
    countries: s.country,
    source: s.store,
    sortBy: "reviews",
    sortOrder: "desc",
    limit: 10,
  }, `Find a leading incumbent for "${s.seedKeyword}"`);
  const top = extractTopApp(data);
  if (top) {
    ctx.topAppId = top.id;
    ctx.topAppTitle = top.title;
  }
}

// ─── the 6 golden prompts ──────────────────────────────────────────────────────

export const GOLDEN_PROMPTS: GoldenPrompt[] = [
  {
    id: "build-app",
    text: (s) => `Build ${s.idea}.`,
    decision: {
      id: "market-viability",
      label: "Is this market worth building in?",
      accepts: acceptsFromTools("find_rising_apps", "search_apps"),
    },
    run: async (h, s, ctx) => {
      const recs: ToolCallRecord[] = [];
      const D = "market-viability";
      await fire(h, recs, D, "get_supported_countries", {}, `Is ${s.country} covered?`);
      await fire(h, recs, D, "get_keyword_difficulty", { keyword: s.seedKeyword, country: s.country, store: s.store }, `How contested is "${s.seedKeyword}"?`);
      const rising = await fire(h, recs, D, "find_rising_apps", { category: s.category, source: s.store, country: s.country, growthPeriod: "30d", limit: 25 }, `Is there momentum in ${s.category}?`);
      let top = extractTopApp(rising);
      if (!top) {
        const incumbents = await fire(h, recs, D, "search_apps", { search: s.seedKeyword, countries: s.country, source: s.store, sortBy: "revenue", sortOrder: "desc", limit: 10 }, `Who monetises "${s.seedKeyword}" today?`);
        top = extractTopApp(incumbents);
      }
      if (top) {
        ctx.topAppId = top.id;
        ctx.topAppTitle = top.title;
      }
      return recs;
    },
  },
  {
    id: "next-feature",
    text: () => "Which feature should I implement next?",
    decision: {
      id: "next-feature",
      label: "What to build next, backed by incumbent review gaps?",
      accepts: acceptsFromTools("find_feature_gaps", "cluster_reviews", "get_app_reviews"),
    },
    run: async (h, s, ctx) => {
      const recs: ToolCallRecord[] = [];
      const D = "next-feature";
      await ensureTopApp(h, recs, s, ctx, D);
      if (ctx.topAppId) {
        await fire(h, recs, D, "get_app_detail", { id: ctx.topAppId }, `Feature surface of ${ctx.topAppTitle}`);
        await fire(h, recs, D, "get_app_reviews", { appId: ctx.topAppId, country: s.country, limit: 50 }, `What do users of ${ctx.topAppTitle} ask for?`);
      }
      // Cross-competitor complaint/request themes — the sharper "what to build next" signal.
      await fire(h, recs, D, "cluster_reviews", { query: s.seedKeyword, country: s.country, store: s.store, limitApps: 8, themeTypes: ["complaint", "request", "bug"] }, `Shared unmet needs across the ${s.seedKeyword} field`);
      // The build/skip checklist: what the field ships vs the whitespace gap to aim at.
      await fire(h, recs, D, "find_feature_gaps", { query: s.seedKeyword, country: s.country, store: s.store, limitApps: 8 }, `Table-stakes vs gaps for a ${s.seedKeyword} app`);
      return recs;
    },
  },
  {
    id: "streaks",
    text: () => "Should this app include streaks?",
    decision: {
      id: "streaks",
      label: "Streaks — yes/no, backed by evidence?",
      accepts: acceptsFromTools("get_app_reviews", "search_apps"),
    },
    run: async (h, s, ctx) => {
      const recs: ToolCallRecord[] = [];
      const D = "streaks";
      await ensureTopApp(h, recs, s, ctx, D);
      if (ctx.topAppId) {
        await fire(h, recs, D, "get_app_reviews", { appId: ctx.topAppId, country: s.country, limit: 100 }, `Do users mention streaks / retention?`);
      }
      await fire(h, recs, D, "search_apps", { search: `${s.seedKeyword} streak`, countries: s.country, source: s.store, limit: 10 }, `Who in ${s.category} ships streaks?`);
      return recs;
    },
  },
  {
    id: "onboarding",
    text: () => "Create the onboarding.",
    decision: {
      id: "onboarding",
      label: "Onboarding structure grounded in a proven incumbent?",
      accepts: acceptsFromTools("get_app_detail"),
    },
    run: async (h, s, ctx) => {
      const recs: ToolCallRecord[] = [];
      const D = "onboarding";
      await ensureTopApp(h, recs, s, ctx, D);
      if (ctx.topAppId) {
        await fire(h, recs, D, "get_app_detail", { id: ctx.topAppId }, `Reference flow from ${ctx.topAppTitle}`);
        await fire(h, recs, D, "get_app_reviews", { appId: ctx.topAppId, country: s.country, limit: 50 }, `Onboarding complaints to avoid`);
      }
      return recs;
    },
  },
  {
    id: "launch",
    text: () => "Prepare this app for launch.",
    decision: {
      id: "launch-readiness",
      label: "Launch keyword + market plan, scored?",
      accepts: acceptsFromTools("batch_keyword_difficulty", "get_keyword_difficulty", "get_keyword_markets"),
    },
    run: async (h, s, ctx) => {
      const recs: ToolCallRecord[] = [];
      const D = "launch-readiness";
      const related = await fire(h, recs, D, "get_related_keywords", { keyword: s.seedKeyword, country: s.country, store: s.store, limit: 20 }, `ASO ideas around "${s.seedKeyword}"`);
      ctx.relatedKeywords = extractKeywords(related, 9);
      const keywords = [s.seedKeyword, ...ctx.relatedKeywords].slice(0, 10).map((keyword) => ({ keyword, country: s.country, store: s.store }));
      await fire(h, recs, D, "batch_keyword_difficulty", { keywords }, `Score the keyword set`);
      await fire(h, recs, D, "get_keyword_markets", { keyword: s.seedKeyword, store: s.store }, `Easiest market for "${s.seedKeyword}"`);
      await fire(h, recs, D, "get_trending_charts", { store: s.store, type: "free", country: s.country, category: s.category, limit: 50 }, `What chart position to beat`);
      return recs;
    },
  },
  {
    id: "market-recheck",
    text: () => "Review the current implementation against the market brief.",
    decision: {
      id: "market-recheck",
      label: "Does the build still match a moving market?",
      accepts: acceptsFromTools("find_rising_apps", "get_app_history"),
    },
    run: async (h, s, ctx) => {
      const recs: ToolCallRecord[] = [];
      const D = "market-recheck";
      await fire(h, recs, D, "find_rising_apps", { category: s.category, source: s.store, country: s.country, growthPeriod: "7d", limit: 25 }, `Has momentum shifted this week?`);
      if (ctx.topAppId) {
        await fire(h, recs, D, "get_app_history", { id: ctx.topAppId }, `Has ${ctx.topAppTitle} moved?`);
      }
      return recs;
    },
  },
];

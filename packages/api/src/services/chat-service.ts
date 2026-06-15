/* ============================================================
   Additive lane — Research chat (PRD-additive-edge D11).

   Grounded Q&A over Kittie's own database. The grounding block is
   assembled from real @kittie/db query exports and handed to the model
   with a hard instruction to answer ONLY from those facts. The same
   facts are returned to the UI so each answer can show "answered from:".

   No key → { enabled: false } and the UI renders the honest disabled
   state. Model failure with a key present → enabled: true but no
   answer, so the UI can say the call failed rather than inventing text.
   ============================================================ */
import {
  countApps,
  countUnreadAlerts,
  listSnapshotContexts,
  listTrackedAppEntries,
} from "@kittie/db";
import { scoreApp, signalsFromContext } from "@kittie/intelligence";
import { getDb } from "../lib/db.js";
import { generateText, seamStatus } from "./llm-seam.js";

export interface ResearchAnswer {
  enabled: boolean;
  answer?: string;
  grounding?: string[];
}

interface TopGrowthApp {
  title: string;
  category: string | null;
  growthScore: number;
  rating: number | null;
  reviewCount: number;
}

/* listSnapshotContexts bulk-loads the full corpus (~100K apps) — fine once,
   not per keystroke. Cache the derived top-10 for a few minutes. */
const TOP_CACHE_MS = 10 * 60 * 1000;
let topCache: { at: number; rows: TopGrowthApp[] } | null = null;

async function topAppsByGrowth(): Promise<TopGrowthApp[]> {
  if (topCache && Date.now() - topCache.at < TOP_CACHE_MS) return topCache.rows;

  const contexts = await listSnapshotContexts(getDb(), "7d");
  const rows = contexts
    .map((ctx) => ({
      ctx,
      item: scoreApp(
        {
          id: ctx.app.id,
          store: ctx.app.store,
          storeAppId: ctx.app.storeAppId,
          title: ctx.app.title,
          iconUrl: ctx.app.iconUrl,
          developer: ctx.app.developer,
          category: ctx.app.category,
          rating: ctx.latest.rating,
          reviewCount: ctx.latest.reviewCount,
          releasedAt: ctx.app.releasedAt?.toISOString() ?? null,
          updatedAt: ctx.app.updatedAt?.toISOString() ?? null,
        },
        signalsFromContext(ctx),
      ),
    }))
    .filter(({ item }) => item.growthScore !== null)
    .sort((a, b) => (b.item.growthScore ?? 0) - (a.item.growthScore ?? 0))
    .slice(0, 10)
    .map(({ ctx, item }) => ({
      title: ctx.app.title,
      category: ctx.app.category,
      growthScore: item.growthScore ?? 0,
      rating: ctx.latest.rating,
      reviewCount: ctx.latest.reviewCount,
    }));

  topCache = { at: Date.now(), rows };
  return rows;
}

/** Real DB facts, one string each, in the exact form shown to the model
    AND returned to the UI. Minimal but honest — nothing invented. */
async function buildGrounding(): Promise<string[]> {
  const db = getDb();
  const facts: string[] = [];

  try {
    const [total, tracked, unread, top] = await Promise.all([
      countApps(db),
      listTrackedAppEntries(db),
      countUnreadAlerts(db),
      topAppsByGrowth(),
    ]);

    facts.push(`Total apps in the Kittie database: ${total.toLocaleString("en-US")}`);
    facts.push(`Apps currently tracked for monitoring: ${tracked.length}`);
    facts.push(`Unread monitoring alerts: ${unread}`);

    if (top.length > 0) {
      facts.push(`Top ${top.length} apps by latest 7-day growth score:`);
      top.forEach((app, i) => {
        const rating = app.rating !== null ? `${app.rating.toFixed(1)}★` : "no rating";
        const category = app.category ?? "uncategorised";
        facts.push(
          `#${i + 1} ${app.title} (${category}) — growth ${app.growthScore.toFixed(1)}, ` +
            `${rating}, ${app.reviewCount.toLocaleString("en-US")} reviews`,
        );
      });
    } else {
      facts.push("No apps have a computed growth score yet.");
    }
  } catch {
    // DB hiccup: return whatever was gathered (possibly nothing). The
    // preamble forces "not in the data" for anything beyond the facts,
    // so a thin facts block degrades honestly instead of hallucinating.
  }

  return facts;
}

const PREAMBLE =
  "You are Kittie's research analyst. Answer ONLY from the facts below; " +
  "say 'not in the data' when asked beyond them. Be concise and concrete — " +
  "cite the specific numbers you use.";

export async function answerResearchQuestion(question: string): Promise<ResearchAnswer> {
  if (!seamStatus().enabled) return { enabled: false };

  const grounding = await buildGrounding();
  const prompt = [
    PREAMBLE,
    "",
    "Facts:",
    ...grounding.map((fact) => `- ${fact}`),
    "",
    `Question: ${question}`,
  ].join("\n");

  const answer = await generateText(prompt, { maxOutputTokens: 1024 });
  return { enabled: true, answer: answer ?? undefined, grounding };
}

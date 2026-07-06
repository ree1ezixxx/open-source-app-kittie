/**
 * Evidence-recall pass (#268 partial, epic #269 criterion 3) — query-mode
 * retrieval over the REVIEW-BEARING app set.
 *
 * Cold-verify proved reorder-only fails: catalog FTS ranks exact-token title
 * matches ("Budgeting App - Spend Tracker", zero reviews) over the famous
 * incumbents whose titles lack the token ("YNAB" ∌ "budgeting"), so review-rich
 * apps never enter discovery's pool and no preference can inject them. This
 * pass searches ONLY the apps that hold reviews (hundreds of rows — scored
 * in-process, DB-only, no LLM) and its hits are merged AHEAD of the catalog
 * pool for the evidence-seeking primitives.
 *
 * Relevance guard: an app is recalled only when it matches ≥1 real query token
 * (≥3 chars, shared ≥4-char prefix counts — budgeting~budget) against its
 * title/category/description. Random review-rich apps never ride along.
 */
import { listReviewedApps } from "@kittie/db";
import { getDb } from "../lib/db.js";

export interface RecalledApp {
  id: string;
  name: string;
  /** Matched query tokens (auditable relevance). */
  matched: string[];
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 2);

const prefixMatch = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const n = 4;
  return a.slice(0, n) === b.slice(0, n);
};

/** Pure scorer — exported for tests. */
export function scoreReviewedApps(
  query: string,
  rows: Array<{ id: string; title: string; category: string | null; description: string | null }>,
  limit: number,
): RecalledApp[] {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0) return [];
  const scored: Array<RecalledApp & { score: number }> = [];
  for (const r of rows) {
    const hay = [...new Set(tokenize(`${r.title} ${r.category ?? ""} ${r.description ?? ""}`))];
    const matched = qTokens.filter((q) => hay.some((h) => prefixMatch(q, h)));
    if (matched.length === 0) continue;
    scored.push({ id: r.id, name: r.title, matched, score: matched.length });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ id, name, matched }) => ({ id, name, matched }));
}

/** Default (DB-backed) recall — the DI seam both ladder services inject. */
export async function recallReviewedApps(query: string, limit: number): Promise<RecalledApp[]> {
  const rows = await listReviewedApps(getDb());
  return scoreReviewedApps(query, rows, limit);
}

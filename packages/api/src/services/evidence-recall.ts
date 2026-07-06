/**
 * Evidence-recall pass (#268 partial, epic #269 criterion 3) — query-mode
 * retrieval over the REVIEW-BEARING app set.
 *
 * Cold-verify history shaped this hard:
 * - Round 1: reorder-only failed — catalog FTS never surfaces review-rich
 *   incumbents whose titles lack the query token (YNAB vs "budgeting").
 * - Round 2: a bare 4-char-prefix guard over descriptions recalled Bose for
 *   "meditation" (desc contains "media") and flooded every set with
 *   alphabetical score-1 ties — confident nonsense. Hence the rules below.
 *
 * Matching rules (deterministic, DB-only, no LLM):
 * - Tokens compare by STEM EQUALITY (tiny suffix-stripper: budgeting→budget,
 *   learning→learn, planning→plan) — never bare prefixes ("medi" ∌ "media").
 * - Title/category hits are the real signal (weight 3). Description-only recall
 *   needs min(2, queryTokens) distinct token hits — one stray description word
 *   never recalls an app for a multi-token query.
 * - Callers cap how many recalled slots may lead the merged set, so catalog
 *   relevance always keeps slots (RECALL_SHARE).
 */
import { listReviewedApps } from "@kittie/db";
import { getDb } from "../lib/db.js";

export interface RecalledApp {
  id: string;
  name: string;
  /** Matched query tokens (auditable relevance). */
  matched: string[];
}

/** Recalled hits may take at most this share of the requested set. */
export const RECALL_SHARE = 0.5;

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

/** Tiny deterministic stemmer — enough for query↔listing morphology. */
export function stem(t: string): string {
  let s = t;
  for (const suf of ["ings", "ing", "ers", "er", "ies", "es", "s", "ed"]) {
    if (s.length - suf.length >= 3 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      if (suf === "ies") s += "y";
      break;
    }
  }
  // drop a doubled trailing consonant left by -ing/-ed strips (plann→plan, runn→run)
  if (s.length >= 4 && s[s.length - 1] === s[s.length - 2] && !"aeiou".includes(s[s.length - 1]!)) {
    s = s.slice(0, -1);
  }
  return s;
}

const stems = (text: string): Set<string> => new Set(tokenize(text).map(stem));

/** Pure scorer — exported for tests. */
export function scoreReviewedApps(
  query: string,
  rows: Array<{ id: string; title: string; category: string | null; description: string | null }>,
  limit: number,
): RecalledApp[] {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0) return [];
  const qStems = qTokens.map((t) => ({ token: t, stem: stem(t) }));

  const scored: Array<RecalledApp & { score: number }> = [];
  for (const r of rows) {
    const titleCat = stems(`${r.title} ${r.category ?? ""}`);
    const desc = stems(r.description ?? "");
    const titleHits = qStems.filter((q) => titleCat.has(q.stem));
    const descHits = qStems.filter((q) => desc.has(q.stem));
    // Description-only recall needs corroboration: 2 distinct query tokens for
    // multi-token queries, 1 for single-token (where 2 is impossible — the
    // YNAB/"budgeting" case). The Bose/"media" class is dead regardless via
    // stem EQUALITY (stem("media") ≠ stem("meditation")).
    if (titleHits.length === 0 && descHits.length < Math.min(2, qStems.length)) continue;
    const matched = [...new Set([...titleHits, ...descHits].map((q) => q.token))];
    scored.push({ id: r.id, name: r.title, matched, score: titleHits.length * 3 + descHits.length });
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

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

/** A stem is DISCRIMINATIVE when it appears in ≤ this share of the reviewed set. */
const DISCRIMINATIVE_DF = 0.25;

/** Pure scorer — exported for tests. */
export function scoreReviewedApps(
  query: string,
  rows: Array<{ id: string; title: string; category: string | null; description: string | null }>,
  limit: number,
): RecalledApp[] {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0) return [];
  const qStems = qTokens.map((t) => ({ token: t, stem: stem(t) }));

  // Per-row stem sets + document frequency over the reviewed set (#268 round 4:
  // "tracker"/"planning" are corpus-common; "sleep"/"meditation" are rare —
  // rarity is the only deterministic relevance signal keyword recall has).
  const rowStems = rows.map((r) => ({
    r,
    titleCat: stems(`${r.title} ${r.category ?? ""}`),
    desc: stems(r.description ?? ""),
  }));
  const df = new Map<string, number>();
  for (const q of qStems) {
    let n = 0;
    for (const rs of rowStems) if (rs.titleCat.has(q.stem) || rs.desc.has(q.stem)) n += 1;
    df.set(q.stem, n);
  }
  const total = Math.max(rows.length, 1);
  const isDiscriminative = (st: string): boolean => (df.get(st) ?? 0) / total <= DISCRIMINATIVE_DF;
  const queryHasDiscriminative = qStems.some((q) => isDiscriminative(q.stem));
  // idf-ish weight: rare tokens dominate ordering; common ones barely count.
  const weight = (st: string): number => Math.log(1 + total / (1 + (df.get(st) ?? 0)));

  const scored: Array<RecalledApp & { score: number }> = [];
  for (const rs of rowStems) {
    const titleHits = qStems.filter((q) => rs.titleCat.has(q.stem));
    const descHits = qStems.filter((q) => rs.desc.has(q.stem));
    const hitStems = new Set([...titleHits, ...descHits].map((q) => q.stem));
    // Gate 1: multi-token queries need ≥2 distinct token hits (lone generic
    // title hit dies — golf "Tracker" for "sleep tracking"); single-token
    // queries need 1 (YNAB/"budgeting").
    if (hitStems.size < Math.min(2, qStems.length)) continue;
    // Gate 2: when the query HAS a discriminative token, a hit on one is
    // mandatory — matching only corpus-common words ("habit"+"tracker" both
    // ubiquitous in wellness/finance blurbs) is not evidence of the niche.
    if (queryHasDiscriminative && ![...hitStems].some(isDiscriminative)) continue;
    const matched = [...new Set([...titleHits, ...descHits].map((q) => q.token))];
    const score =
      titleHits.reduce((a, q) => a + 3 * weight(q.stem), 0) + descHits.reduce((a, q) => a + weight(q.stem), 0);
    scored.push({ id: rs.r.id, name: rs.r.title, matched, score });
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

import type { Store } from "@kittie/types";

import { suggestAppleKeyword } from "./apple/suggest.js";
import { suggestGoogleKeyword } from "./google/suggest.js";

const HINT_LIMIT = 12;

type Suggest = (prefix: string) => Promise<string[]>;

/** Rank of `k` within ranked hints: exact match first, else a hint that extends `k`. */
function rankOf(k: string, hints: string[]): number {
  const lc = hints.map((h) => h.toLowerCase());
  const exact = lc.indexOf(k);
  if (exact >= 0) return exact;
  return lc.findIndex((h) => h === k || h.startsWith(`${k} `));
}

/**
 * Real search-popularity proxy (0–100) from store autocomplete.
 *
 * Store "as-you-type" hints are ordered by actual search volume, so two signals
 * fall out of them:
 *
 *   • breadth — how many completions the *full* term spawns. Head terms branch
 *     into a long list of popular sub-queries ("meditation" → 10); long-tail
 *     phrases self-complete alone ("ergonomic posture corrector" → 1).
 *   • reach — whether the term already surfaces from a short 3–4 char stub.
 *     Only genuinely high-volume heads do ("med" → #0 meditation); niche
 *     phrases never appear until almost fully typed.
 *
 * Two cheap probes (run in parallel) combine to a differentiated score. Returns
 * null for terms too short to probe — the caller falls back to its review-based
 * estimate, which saturates but is better than nothing.
 */
export async function searchPopularity(
  keyword: string,
  country: string,
  store: Store,
): Promise<number | null> {
  const k = keyword.trim().toLowerCase();
  const n = k.length;
  if (n < 3) return null;

  const suggest: Suggest =
    store === "google"
      ? (p) => suggestGoogleKeyword(p, country, HINT_LIMIT)
      : (p) => suggestAppleKeyword(p, country, HINT_LIMIT);

  // Reach probe: a short stub, only when it's genuinely shorter than the term.
  const stubLen = Math.max(3, Math.round(n * 0.4));
  const wantReach = stubLen < n;

  const [full, stub] = await Promise.all([
    suggest(k).catch(() => null),
    wantReach ? suggest(k.slice(0, stubLen)).catch(() => null) : Promise.resolve(null),
  ]);

  // Total network failure → unknown; let the caller fall back.
  if (full == null && stub == null) return null;

  // Breadth (0–70): completions spawned by the full term, normalised to ~10.
  const breadth = Math.min((full?.length ?? 0) / 10, 1) * 70;

  // Reach (0–30): surfaces early and high in the stub list.
  let reach = 0;
  if (stub && stub.length > 0) {
    const r = rankOf(k, stub);
    if (r >= 0) reach = (1 - r / HINT_LIMIT) * 30;
  }

  return Math.max(1, Math.min(100, Math.round(breadth + reach)));
}

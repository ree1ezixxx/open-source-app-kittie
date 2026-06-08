import gplay from "google-play-scraper";
import type { Store } from "@kittie/types";

import { searchAppleKeyword } from "./apple/search.js";
import { suggestAppleKeyword } from "./apple/suggest.js";
import { suggestGoogleKeyword } from "./google/suggest.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "your",
  "my", "app", "apps", "free", "pro", "plus", "lite", "best", "new", "by",
  "&", "-", "—", "|", ":",
]);

/** Real search-autocomplete hints for the seed (clean, prefix-based). */
async function autocomplete(seed: string, country: string, store: Store): Promise<string[]> {
  try {
    return store === "google"
      ? await suggestGoogleKeyword(seed, country)
      : await suggestAppleKeyword(seed, country);
  } catch {
    return [];
  }
}

/** Top competing app titles for the seed (titles only — no review enrichment). */
async function competitorTitles(seed: string, country: string, store: Store): Promise<string[]> {
  try {
    if (store === "google") {
      const hits = (await gplay.search({
        term: seed,
        num: 15,
        country: country.toLowerCase(),
      } as Parameters<typeof gplay.search>[0])) as Array<{ title: string }>;
      return hits.map((h) => h.title);
    }
    return (await searchAppleKeyword(seed, country, 15)).map((r) => r.title);
  } catch {
    return [];
  }
}

/** 2–3 word, on-theme phrases drawn from competitor titles, with brand names filtered out. */
function extractPhrases(titles: string[], seedTokens: Set<string>): string[] {
  const tokenized = titles.map((title) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );

  // Document frequency: brand names occur in one title; real keywords recur.
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const isBrandish = (t: string) => !seedTokens.has(t) && (df.get(t) ?? 0) < 2;

  const phrases = new Set<string>();
  for (const tokens of tokenized) {
    for (let i = 0; i + 2 <= tokens.length; i++) {
      const [a, b] = [tokens[i]!, tokens[i + 1]!];
      // Clean bigram: pairs one seed token with one new on-theme token, no brand token.
      if (a !== b && seedTokens.has(a) !== seedTokens.has(b) && !isBrandish(a) && !isBrandish(b)) {
        phrases.add(`${a} ${b}`);
      }
    }
  }
  return [...phrases];
}

/**
 * Related keyword ideas for a seed, sourced from real store data:
 * search autocomplete (clean intent) + competitor-title phrases (breadth, on-theme).
 */
export async function suggestRelatedKeywords(
  seed: string,
  country: string,
  store: Store,
  limit = 20,
): Promise<string[]> {
  const seedLower = seed.trim().toLowerCase();
  const seedTokens = new Set(
    seedLower.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );

  const [hints, titles] = await Promise.all([
    autocomplete(seed, country, store),
    competitorTitles(seed, country, store),
  ]);

  const found = new Map<string, string>(); // lowercased -> original casing
  const add = (term: string) => {
    const key = term.trim().toLowerCase();
    if (key && key !== seedLower && !found.has(key)) found.set(key, term.trim());
  };

  // Autocomplete first (highest intent), then on-theme competitor phrases.
  hints.forEach(add);
  extractPhrases(titles, seedTokens).forEach(add);

  return [...found.values()].slice(0, limit);
}

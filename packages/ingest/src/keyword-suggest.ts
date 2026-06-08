import gplay from "google-play-scraper";
import type { Store } from "@kittie/types";

import { suggestAppleKeyword } from "./apple/suggest.js";
import { suggestGoogleKeyword } from "./google/suggest.js";

/**
 * Generic English + store-listing filler. These words recur in every app
 * description ("the best free app to learn…") but carry no ASO intent, so they
 * must never appear inside a mined keyword phrase.
 */
const STOPWORDS = new Set(
  (
    "the a an and or but for to of in on at by with from as is it its this that " +
    "these those you your my our we they them their he she his her i me us who " +
    "whom whose which what when where why how all any both each few more most " +
    "other some such no nor not only own same so than too very can will just " +
    "should now then once here there about above below up down out off over under " +
    "again further also into onto upon per via if else while because until against " +
    "between among through during before after around app apps free pro plus lite " +
    "premium best new top get got use used using make made help helps learn " +
    "learning study studying course courses lesson featured love loved fun funny " +
    "designed design world worldwide whether want wants wanted start started " +
    "starting native day days mobile system easy easily quick simple way ways thing " +
    "things people user users one two three first second download downloads " +
    "available offer offers including include includes well good great amazing " +
    "awesome perfect ultimate complete full daily based able let lets every need " +
    "needs like has have had would could may might must shall com www http https " +
    "inc ltd llc features feature explore discover introducing meet say hello " +
    "goodbye key powerful smart fast loved trusted millions join today"
  ).split(/\s+/),
);

/** Meme / social completions Apple's hint endpoint surfaces for bare head terms. */
const JUNK_MARKER = /\b(y'?all|gon|gonna|wanna|gotta|lol|lmao|meme|memes|tiktok|reddit|song|songs|lyrics?)\b/i;

const tokenize = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

const isNoiseToken = (w: string): boolean =>
  w.length < 3 || STOPWORDS.has(w) || !/^[a-z]+$/.test(w);

interface MinedApp {
  title: string;
  desc: string;
}

/** Top competing apps for the seed, with the keyword-rich opening of each description. */
async function appleCorpus(seed: string, country: string): Promise<MinedApp[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", seed);
  url.searchParams.set("entity", "software");
  url.searchParams.set("country", country.toLowerCase());
  url.searchParams.set("limit", "40");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ trackName?: string; description?: string }>;
  };
  return (data.results ?? []).map((a) => ({
    title: a.trackName ?? "",
    desc: (a.description ?? "").slice(0, 400),
  }));
}

async function googleCorpus(seed: string, country: string): Promise<MinedApp[]> {
  const hits = (await gplay.search({
    term: seed,
    num: 40,
    country: country.toLowerCase(),
  } as Parameters<typeof gplay.search>[0])) as Array<{ title?: string; summary?: string }>;
  return hits.map((h) => ({
    title: h.title ?? "",
    desc: (h.summary ?? "").slice(0, 400),
  }));
}

/**
 * Mine real ASO keyword phrases from the competitor field — the same signal a
 * paid tool uses. Apps put their target keywords in their title and the opening
 * of their description, so verbatim 2–3 word phrases that (a) stay on-theme with
 * the seed and (b) recur across the field are genuine search terms, not memes.
 *
 *  - on-theme gate: every phrase must contain a seed token (drops generic copy).
 *  - brand gate: each non-seed token must appear in ≥2 distinct apps — a brand
 *    name ("pleco", "skritter") lives in exactly one listing, so it's filtered.
 *  - score: corpus frequency + title presence (intentional ASO) + 2-word bonus
 *    (the sweet spot for ASO targets), then collapse word-order duplicates.
 */
function mineIdeas(seed: string, apps: MinedApp[], limit: number): string[] {
  const seedLower = seed.trim().toLowerCase();
  let seedTokens = new Set(tokenize(seedLower).filter((t) => t.length > 2));
  if (seedTokens.size === 0) seedTokens = new Set(tokenize(seedLower)); // short seed fallback

  // Document frequency: how many distinct apps mention each token.
  const df = new Map<string, number>();
  for (const a of apps) {
    for (const t of new Set(tokenize(`${a.title} ${a.desc}`).filter((x) => x.length > 2))) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  // Verbatim 2–3 grams from each listing (title + description weighted apart).
  const cand = new Map<string, { freq: number; inTitle: number }>();
  for (const a of apps) {
    const seen = new Set<string>();
    for (const [seg, txt] of [["T", a.title], ["D", a.desc]] as const) {
      const ws = tokenize(txt);
      for (let n = 2; n <= 3; n++) {
        for (let j = 0; j + n <= ws.length; j++) {
          const gram = ws.slice(j, j + n);
          if (gram.some(isNoiseToken)) continue;
          const phrase = gram.join(" ");
          const key = phrase + seg;
          if (seen.has(key)) continue;
          seen.add(key);
          const entry = cand.get(phrase) ?? { freq: 0, inTitle: 0 };
          entry.freq++;
          if (seg === "T") entry.inTitle++;
          cand.set(phrase, entry);
        }
      }
    }
  }

  const scored: Array<{ phrase: string; score: number }> = [];
  for (const [phrase, e] of cand) {
    if (phrase === seedLower) continue;
    const gram = phrase.split(" ");
    if (!gram.some((w) => seedTokens.has(w))) continue; // on-theme
    const nonSeed = gram.filter((w) => !seedTokens.has(w));
    if (nonSeed.length === 0) continue; // a pure reordering of the seed
    if (!nonSeed.every((w) => (df.get(w) ?? 0) >= 2)) continue; // brand / one-off
    const dfSum = nonSeed.reduce((s, w) => s + (df.get(w) ?? 0), 0);
    const score = e.freq * 3 + e.inTitle * 4 + dfSum + (gram.length === 2 ? 4 : 0);
    scored.push({ phrase, score });
  }

  // Collapse word-order duplicates ("read chinese" / "chinese read") to the best.
  const byKey = new Map<string, { phrase: string; score: number }>();
  for (const s of scored) {
    const key = s.phrase.split(" ").slice().sort().join(" ");
    const cur = byKey.get(key);
    if (!cur || s.score > cur.score) byKey.set(key, s);
  }

  return [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.phrase);
}

/** Search-autocomplete hints, kept only when on-theme and meme-free. */
async function cleanHints(seed: string, country: string, store: Store, seedTokens: Set<string>): Promise<string[]> {
  let hints: string[];
  try {
    hints = store === "google"
      ? await suggestGoogleKeyword(seed, country)
      : await suggestAppleKeyword(seed, country);
  } catch {
    return [];
  }
  return hints.filter((h) => {
    const toks = tokenize(h);
    return (
      toks.length >= 2 &&
      toks.length <= 4 &&
      !JUNK_MARKER.test(h) &&
      toks.some((t) => seedTokens.has(t))
    );
  });
}

/**
 * Related keyword ideas for a seed, sourced from real store data: competitor
 * title + description mining (the bulk — real ASO terms, brands filtered) topped
 * up with on-theme search-autocomplete hints.
 */
export async function suggestRelatedKeywords(
  seed: string,
  country: string,
  store: Store,
  limit = 20,
): Promise<string[]> {
  const seedLower = seed.trim().toLowerCase();
  const seedTokens = new Set(tokenize(seedLower).filter((t) => t.length > 2));

  const [apps, hints] = await Promise.all([
    (store === "google" ? googleCorpus(seed, country) : appleCorpus(seed, country)).catch(
      () => [] as MinedApp[],
    ),
    cleanHints(seed, country, store, seedTokens.size ? seedTokens : new Set(tokenize(seedLower))),
  ]);

  const found = new Map<string, string>(); // lowercased -> original casing
  const add = (term: string) => {
    const key = term.trim().toLowerCase();
    if (key && key !== seedLower && !found.has(key)) found.set(key, term.trim());
  };

  // Mined competitor phrases first (highest quality), then clean autocomplete.
  mineIdeas(seed, apps, limit).forEach(add);
  hints.forEach(add);

  return [...found.values()].slice(0, limit);
}

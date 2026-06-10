import type { KeywordDifficulty } from "@kittie/types";
import type { KeywordDifficultyInput } from "./types.js";

/** v1: competing app count in top 10 + avg review count of leaders. */
export function computeKeywordDifficulty(input: KeywordDifficultyInput): KeywordDifficulty {
  const topApps = input.topRankedApps.slice(0, 10);
  const competingAppCount = topApps.length;
  const avgReviews =
    competingAppCount > 0
      ? topApps.reduce((sum, a) => sum + a.reviewCount, 0) / competingAppCount
      : 0;

  const difficulty = computeDifficulty(input.keyword, topApps);

  // Prefer the real autocomplete-reach popularity when ingest supplies it; the
  // review-based estimate below saturates (any niche with a big incumbent maxes
  // out), so it's only a fallback when the live probe is unavailable.
  const totalReviews = topApps.reduce((sum, a) => sum + a.reviewCount, 0);
  const reviewPopularity = Math.min(
    100,
    Math.round(Math.min(totalReviews / 100_000, 1) * 70 + (competingAppCount / 10) * 30),
  );
  const popularity =
    input.searchPopularity != null
      ? Math.max(0, Math.min(100, Math.round(input.searchPopularity)))
      : reviewPopularity;
  const trafficScore = Math.min(100, Math.round(Math.min(avgReviews / 30_000, 1) * 100));

  return {
    keyword: input.keyword,
    country: input.country,
    store: input.store,
    popularity,
    difficulty,
    trafficScore,
    opportunityScore: computeOpportunityScore(popularity, difficulty),
    competingAppCount,
    topApps,
  };
}

/** v1: no manual relevance term — max 70 before UI adds app-specific context. */
export function computeOpportunityScore(popularity: number, difficulty: number): number {
  return Math.round(popularity * 0.4 + (100 - difficulty) * 0.3);
}

type RankedApp = KeywordDifficultyInput["topRankedApps"][number];

/**
 * Difficulty (0–100) from observable facts about the top-10 ranking apps — never
 * inflated or stretched. Every signal is store-reported ground truth, so the score
 * maps to reality: a brutal term reads high, a genuinely open term reads low.
 *
 *  - title-match density (35): how many leaders deliberately target the term in
 *    their NAME. Few = a real relevance opening; you can out-target them.
 *  - weakest-link reviews (30): reviews of the easiest top-10 slot to displace —
 *    the real bar to break IN, not the average (which one giant inflates).
 *  - median reviews (25): overall strength of the field — a robust ceiling.
 *  - rating (10): a polished, highly-rated field is harder to unseat.
 *
 * A thin field (<10 results) is genuinely easier, so the whole score scales by
 * how full the top-10 is. Reviews use a log curve (1M reviews = ceiling) because
 * competitive strength is logarithmic, not linear.
 */
function computeDifficulty(keyword: string, topApps: RankedApp[]): number {
  const n = topApps.length;
  if (n === 0) return 0;

  const phrase = keyword.toLowerCase().trim();
  const tokens = phrase.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const targets = topApps.filter((a) => {
    const t = a.title.toLowerCase();
    return t.includes(phrase) || (tokens.length > 0 && tokens.every((tok) => t.includes(tok)));
  }).length;
  const titleDensity = targets / n;

  const reviews = topApps.map((a) => a.reviewCount).sort((x, y) => x - y);
  const weakest = reviews[0] ?? 0;
  const median = reviews[Math.floor(n / 2)] ?? 0;

  const MAX_LOG = Math.log10(1_000_000 + 1); // 1M reviews = strength ceiling
  const logNorm = (v: number) => Math.min(1, Math.log10(Math.max(0, v) + 1) / MAX_LOG);

  const avgRating = topApps.reduce((s, a) => s + (a.rating ?? 0), 0) / n;

  const titleScore = titleDensity * 35;
  const weakScore = logNorm(weakest) * 30;
  const medianScore = logNorm(median) * 25;
  const ratingScore = Math.min(1, avgRating / 5) * 10;

  const fullness = Math.min(1, n / 10); // a thin field is genuinely easier
  const difficulty = (titleScore + weakScore + medianScore + ratingScore) * fullness;
  return Math.round(Math.max(0, Math.min(100, difficulty)));
}

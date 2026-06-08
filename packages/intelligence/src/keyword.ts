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

  const countScore = Math.min(competingAppCount / 10, 1) * 40;
  const reviewScore = Math.min(avgReviews / 50_000, 1) * 60;
  const difficulty = Math.round(countScore + reviewScore);

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

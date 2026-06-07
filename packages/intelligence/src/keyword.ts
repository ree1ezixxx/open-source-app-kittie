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

  const popularity = Math.min(100, Math.round(difficulty * 0.7 + competingAppCount * 3));
  const trafficScore = Math.round(popularity * 0.85);

  return {
    keyword: input.keyword,
    country: input.country,
    store: input.store,
    popularity,
    difficulty,
    trafficScore,
    competingAppCount,
    topApps,
  };
}

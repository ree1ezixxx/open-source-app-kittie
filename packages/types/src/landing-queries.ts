import type { AppSearchParams } from "./index.js";

const MS_PER_DAY = 86_400_000;

export function releasedAfterDaysAgo(days: number, now = Date.now()): number {
  return Math.floor((now - days * MS_PER_DAY) / 1000);
}

export function sevenDayReleasedAfterEpoch(now = Date.now()): number {
  return releasedAfterDaysAgo(7, now);
}

/** Pulse briefing widgets — shared by web prefetch, Pulse page, and API warm-cache. */
export function pulseAppQueries(now = Date.now()): [AppSearchParams, AppSearchParams, AppSearchParams] {
  const releasedAfter = sevenDayReleasedAfterEpoch(now);
  return [
    { sortBy: "reviews", sortOrder: "desc", releasedAfter },
    { sortBy: "rankDelta", sortOrder: "desc" },
    { sortBy: "rankDelta", sortOrder: "asc" },
  ];
}

/**
 * Explore default list query (empty filter URL).
 * Must stay aligned with `EMPTY_FILTERS` in apps/web exploreFilters.ts.
 */
export function defaultExploreAppQuery(): AppSearchParams {
  return { growthPeriod: "7d", sortBy: "revenue", sortOrder: "desc" };
}

/** API startup warm set — explicit limit so paginated responses match first paint. */
export function landingWarmQueries(now = Date.now()): AppSearchParams[] {
  const limit = 50;
  return [
    { ...defaultExploreAppQuery(), limit },
    ...pulseAppQueries(now).map((q) => ({ ...q, limit })),
  ];
}

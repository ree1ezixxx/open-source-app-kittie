export interface RankResolverHit {
  storeAppId: string;
  rank: number;
}

/** Resolve a store search result list to this app's 1-based Keyword ranking. */
export function resolveKeywordPosition(
  results: readonly RankResolverHit[],
  storeAppId: string,
): number | null {
  const target = storeAppId.trim();
  if (!target) return null;

  const hit = results.find((result) => result.storeAppId === target);
  return hit?.rank ?? null;
}

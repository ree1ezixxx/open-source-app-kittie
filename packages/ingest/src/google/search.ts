import gplay from "google-play-scraper";

import { fetchGoogleAppMetadata } from "./metadata.js";
import { sleep } from "../util/rate-limit.js";
import type { StoreSearchResult } from "../apple/search.js";

/** Top Play Store search results; enriches with review counts (search omits them). */
export async function searchGoogleKeyword(
  keyword: string,
  country = "us",
  limit = 10,
): Promise<StoreSearchResult[]> {
  const hits = await gplay.search({
    term: keyword,
    num: limit,
    country: country.toLowerCase(),
  } as Parameters<typeof gplay.search>[0]);

  const results: StoreSearchResult[] = [];

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    let reviewCount = 0;
    let rating: number | null = hit.score ?? null;

    try {
      const meta = await fetchGoogleAppMetadata(hit.appId, country);
      reviewCount = meta.reviewCount;
      rating = meta.rating ?? rating;
    } catch {
      // Keep search-level score when detail fetch fails.
    }

    results.push({
      storeAppId: hit.appId,
      title: hit.title,
      iconUrl: hit.icon,
      reviewCount,
      rating,
      rank: i + 1,
    });

    if (i < hits.length - 1) await sleep(120);
  }

  return results;
}

/**
 * Depth of the competing field for a term — a single cheap, un-enriched search
 * (no per-app metadata calls). Play search has no total-count field, so this is
 * how many apps it returns up to `cap`.
 */
export async function countGoogleResults(
  keyword: string,
  country = "us",
  cap = 200,
): Promise<number> {
  const hits = await gplay.search({
    term: keyword,
    num: cap,
    country: country.toLowerCase(),
  } as Parameters<typeof gplay.search>[0]);
  return hits.length;
}

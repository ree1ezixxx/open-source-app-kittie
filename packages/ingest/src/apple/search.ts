export interface StoreSearchResult {
  storeAppId: string;
  title: string;
  iconUrl: string | null;
  reviewCount: number;
  rating: number | null;
  rank: number;
}

interface ItunesSearchResponse {
  resultCount: number;
  results?: Array<{
    trackId: number;
    trackName: string;
    artworkUrl100?: string;
    artworkUrl512?: string;
    userRatingCount?: number;
    averageUserRating?: number;
  }>;
}

/** Top App Store search results for a keyword (public iTunes Search API). */
export async function searchAppleKeyword(
  keyword: string,
  country = "us",
  limit = 10,
): Promise<StoreSearchResult[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", keyword);
  url.searchParams.set("entity", "software");
  url.searchParams.set("country", country.toLowerCase());
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iTunes search failed: ${response.status}`);
  }

  const data = (await response.json()) as ItunesSearchResponse;
  return (data.results ?? []).map((item, index) => ({
    storeAppId: String(item.trackId),
    title: item.trackName,
    iconUrl: item.artworkUrl512 ?? item.artworkUrl100 ?? null,
    reviewCount: item.userRatingCount ?? 0,
    rating: item.averageUserRating ?? null,
    rank: index + 1,
  }));
}

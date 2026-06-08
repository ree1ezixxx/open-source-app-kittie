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

/** Top results plus the true depth of the competing field (`fieldDepth`). */
export interface StoreSearchField {
  results: StoreSearchResult[];
  fieldDepth: number;
}

async function fetchAppleSearch(keyword: string, country: string, limit: number): Promise<ItunesSearchResponse> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", keyword);
  url.searchParams.set("entity", "software");
  url.searchParams.set("country", country.toLowerCase());
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iTunes search failed: ${response.status}`);
  }
  return (await response.json()) as ItunesSearchResponse;
}

function mapResults(data: ItunesSearchResponse): StoreSearchResult[] {
  return (data.results ?? []).map((item, index) => ({
    storeAppId: String(item.trackId),
    title: item.trackName,
    iconUrl: item.artworkUrl512 ?? item.artworkUrl100 ?? null,
    reviewCount: item.userRatingCount ?? 0,
    rating: item.averageUserRating ?? null,
    rank: index + 1,
  }));
}

/** Top App Store search results for a keyword (public iTunes Search API). */
export async function searchAppleKeyword(
  keyword: string,
  country = "us",
  limit = 10,
): Promise<StoreSearchResult[]> {
  return mapResults(await fetchAppleSearch(keyword, country, limit));
}

/**
 * One large fetch (`limit` up to 200) that yields both the ranking apps and the
 * real depth of the competing field — `resultCount` is how many apps Apple
 * actually returns for the term, which is the honest "competing apps" number.
 */
export async function searchAppleKeywordField(
  keyword: string,
  country = "us",
  limit = 200,
): Promise<StoreSearchField> {
  const data = await fetchAppleSearch(keyword, country, limit);
  return { results: mapResults(data), fieldDepth: data.resultCount ?? (data.results?.length ?? 0) };
}

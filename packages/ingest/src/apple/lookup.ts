import { parseAppleDate } from "../util/dates.js";

export interface AppleLookupResult {
  storeAppId: string;
  bundleId: string | null;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  price: number | null;
  contentRating: string | null;
  languages: string[];
  screenshotUrls: string[];
  releasedAt: Date | null;
  updatedAt: Date | null;
  reviewCount: number;
  rating: number | null;
}

interface ItunesLookupResponse {
  resultCount: number;
  results?: Array<{
    trackId: number;
    bundleId?: string;
    trackName: string;
    artistName: string;
    primaryGenreName?: string;
    artworkUrl512?: string;
    artworkUrl100?: string;
    description?: string;
    sellerUrl?: string;
    price?: number;
    contentAdvisoryRating?: string;
    languageCodesISO2A?: string[];
    screenshotUrls?: string[];
    ipadScreenshotUrls?: string[];
    releaseDate?: string;
    currentVersionReleaseDate?: string;
    userRatingCount?: number;
    averageUserRating?: number;
  }>;
}

const LOOKUP_BATCH_SIZE = 50;

export async function lookupAppleApps(storeAppIds: string[]): Promise<AppleLookupResult[]> {
  const results: AppleLookupResult[] = [];

  for (let i = 0; i < storeAppIds.length; i += LOOKUP_BATCH_SIZE) {
    const batch = storeAppIds.slice(i, i + LOOKUP_BATCH_SIZE);
    const url = `https://itunes.apple.com/lookup?id=${batch.join(",")}&country=us`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`iTunes lookup failed: ${response.status}`);
    }

    const data = (await response.json()) as ItunesLookupResponse;
    for (const item of data.results ?? []) {
      results.push(mapLookupResult(item));
    }
  }

  return results;
}

export async function lookupAppleApp(storeAppId: string): Promise<AppleLookupResult | null> {
  const results = await lookupAppleApps([storeAppId]);
  return results[0] ?? null;
}

function mapLookupResult(item: NonNullable<ItunesLookupResponse["results"]>[number]): AppleLookupResult {
  const screenshots = [
    ...(item.screenshotUrls ?? []),
    ...(item.ipadScreenshotUrls ?? []),
  ];

  return {
    storeAppId: String(item.trackId),
    bundleId: item.bundleId ?? null,
    title: item.trackName,
    developer: item.artistName,
    category: item.primaryGenreName ?? null,
    iconUrl: item.artworkUrl512 ?? item.artworkUrl100 ?? null,
    description: item.description ?? null,
    websiteUrl: item.sellerUrl ?? null,
    price: item.price ?? null,
    contentRating: item.contentAdvisoryRating ?? null,
    languages: item.languageCodesISO2A ?? [],
    screenshotUrls: screenshots,
    releasedAt: parseAppleDate(item.releaseDate),
    updatedAt: parseAppleDate(item.currentVersionReleaseDate),
    reviewCount: item.userRatingCount ?? 0,
    rating: item.averageUserRating ?? null,
  };
}

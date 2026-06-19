import { clampStoreDate } from "../util/dates.js";

export interface AppleLookupResult {
  storeAppId: string;
  artistId: string | null;
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
  /** Listing facts for App Detail parity. */
  fileSizeBytes: number | null;
  minOsVersion: string | null;
  sellerName: string | null;
}

interface ItunesLookupResponse {
  resultCount: number;
  results?: Array<{
    wrapperType?: string;
    kind?: string;
    trackId: number;
    artistId?: number;
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
    fileSizeBytes?: string;
    minimumOsVersion?: string;
    sellerName?: string;
  }>;
}

// Apple's lookup accepts up to 200 ids per request — batch at the max to cut
// per-country call volume 4× (the Apple-IP rate ceiling, not SQLite, is the
// snapshot bottleneck — see ADR 0007).
const LOOKUP_BATCH_SIZE = 200;

/** `country` selects the storefront: userRatingCount/averageUserRating/price are
 *  per-market, so a per-country snapshot passes its market here (default `us`). */
export async function lookupAppleApps(
  storeAppIds: string[],
  country = "us",
): Promise<AppleLookupResult[]> {
  const results: AppleLookupResult[] = [];

  for (let i = 0; i < storeAppIds.length; i += LOOKUP_BATCH_SIZE) {
    const batch = storeAppIds.slice(i, i + LOOKUP_BATCH_SIZE);
    const url = `https://itunes.apple.com/lookup?id=${batch.join(",")}&country=${country}`;
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

export async function lookupAppleApp(
  storeAppId: string,
  country = "us",
): Promise<AppleLookupResult | null> {
  const results = await lookupAppleApps([storeAppId], country);
  return results[0] ?? null;
}

/**
 * All apps published by one developer (artist). `lookup?id=<artistId>&entity=software`
 * returns the artist record plus every one of their software titles, with full metadata.
 * The seam the snowball expands on — fan a known developer out to their whole catalog.
 */
export async function lookupDeveloperApps(artistId: string, country = "us"): Promise<AppleLookupResult[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=software&limit=200&country=${country}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`developer lookup failed: ${response.status}`);
  const data = (await response.json()) as ItunesLookupResponse;
  return (data.results ?? [])
    .filter((item) => item.wrapperType === "software" || item.kind === "software")
    .map(mapLookupResult);
}

function mapLookupResult(item: NonNullable<ItunesLookupResponse["results"]>[number]): AppleLookupResult {
  const screenshots = [
    ...(item.screenshotUrls ?? []),
    ...(item.ipadScreenshotUrls ?? []),
  ];

  return {
    storeAppId: String(item.trackId),
    artistId: item.artistId != null ? String(item.artistId) : null,
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
    releasedAt: clampStoreDate(item.releaseDate),
    updatedAt: clampStoreDate(item.currentVersionReleaseDate),
    reviewCount: item.userRatingCount ?? 0,
    rating: item.averageUserRating ?? null,
    fileSizeBytes: item.fileSizeBytes != null ? Number(item.fileSizeBytes) || null : null,
    minOsVersion: item.minimumOsVersion ?? null,
    sellerName: item.sellerName ?? null,
  };
}

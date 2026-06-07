import gplay from "google-play-scraper";

import { sleep } from "../util/rate-limit.js";

/** Runtime enum objects — package types declare enums but don't expose values to TS. */
const gplayConstants = gplay as typeof gplay & {
  collection: { TOP_FREE: string; TOP_PAID: string; GROSSING: string };
  category: { APPLICATION: string };
};

export interface GoogleChartEntry {
  storeAppId: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  chartCategory: string;
  chartRank: number;
  chartCountry: string;
}

export interface GoogleAppMetadata {
  storeAppId: string;
  bundleId: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  contentRating: string | null;
  screenshotUrls: string[];
  releasedAt: Date | null;
  updatedAt: Date | null;
  reviewCount: number;
  rating: number | null;
  price: number | null;
}

const GOOGLE_CHARTS = [
  { chartCategory: "top-free", collection: gplayConstants.collection.TOP_FREE },
  { chartCategory: "top-grossing", collection: gplayConstants.collection.GROSSING },
] as const;

export async function fetchGoogleCharts(
  country = "us",
  limit = 50,
): Promise<GoogleChartEntry[]> {
  const entries: GoogleChartEntry[] = [];
  const seen = new Set<string>();

  for (const chart of GOOGLE_CHARTS) {
    const results = await gplay.list({
      collection: chart.collection,
      category: gplayConstants.category.APPLICATION,
      num: limit,
      country,
    } as Parameters<typeof gplay.list>[0]);

    results.forEach((item, index) => {
      if (seen.has(item.appId)) return;
      seen.add(item.appId);

      entries.push({
        storeAppId: item.appId,
        title: item.title,
        developer: item.developer,
        iconUrl: item.icon,
        chartCategory: chart.chartCategory,
        chartRank: index + 1,
        chartCountry: country.toUpperCase(),
      });
    });
  }

  return entries;
}

export async function fetchGoogleAppMetadata(
  storeAppId: string,
  country = "us",
): Promise<GoogleAppMetadata> {
  const app = await gplay.app({ appId: storeAppId, country });

  return {
    storeAppId: app.appId,
    bundleId: app.appId,
    title: app.title,
    developer: app.developer,
    category: app.genre ?? null,
    iconUrl: app.icon,
    description: app.summary ?? app.description ?? null,
    websiteUrl: app.developerWebsite ?? null,
    contentRating: app.contentRating ?? null,
    screenshotUrls: app.screenshots ?? [],
    releasedAt: app.released ? new Date(app.released) : null,
    updatedAt: app.updated ? new Date(app.updated) : null,
    reviewCount: app.reviews ?? 0,
    rating: app.score ?? null,
    price: app.free ? 0 : (app.price ?? null),
  };
}

export async function fetchGoogleAppsMetadata(
  storeAppIds: string[],
  country = "us",
  delayMs = 150,
): Promise<GoogleAppMetadata[]> {
  const results: GoogleAppMetadata[] = [];

  for (const storeAppId of storeAppIds) {
    try {
      results.push(await fetchGoogleAppMetadata(storeAppId, country));
    } catch (error) {
      console.warn(`Google metadata fetch failed for ${storeAppId}:`, error);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return results;
}

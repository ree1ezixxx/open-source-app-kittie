#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { fetchAppleCharts, fetchAppleGenreCharts, type AppleChartEntry } from "../apple/charts.js";
import { lookupAppleApps } from "../apple/lookup.js";
import { insertAppIfAbsent, upsertSnapshot } from "../db/apps.js";
import { fetchGoogleAppsMetadata, fetchGoogleCharts } from "../google/metadata.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

/**
 * Per-market charting snapshot sweep (ADR 0007). For each market it snapshots the
 * apps that actually CHART there (overall + per-genre, Apple + Google) with that
 * market's Observed metrics — review count, rating and chart rank are storefront-
 * specific. Bounded by construction (~4–5k apps/market), so it never touches the
 * full-catalog `snapshot-bulk` path (the one that OOMs — that fix is a prerequisite
 * for any FULL-catalog per-market backfill, not for this charting sweep).
 *
 * - Apple lookups are batched (200/call) and pull per-country review/rating/price.
 * - `insertAppIfAbsent` adds genuinely foreign-only apps without clobbering the
 *   catalog's canonical (US/English) metadata with a localized title.
 * - Google Play has no China storefront, so CN is Apple-only.
 */
const DEFAULT_MARKETS = ["US", "GB", "JP", "KR", "DE", "FR", "ES", "IT", "BR", "MX", "IN", "CA", "AU", "CN"];
const NO_GOOGLE_PLAY = new Set(["CN"]); // Google Play does not operate in mainland China.

function marketsFromEnv(): string[] {
  const raw = process.env.SNAPSHOT_MARKETS;
  if (!raw) return DEFAULT_MARKETS;
  return raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
}

/** Overall charts rank ahead of per-genre, so the more prestigious rank wins on dedup. */
function uniqueAppleCharts(overall: AppleChartEntry[], genre: AppleChartEntry[]): Map<string, AppleChartEntry> {
  const byId = new Map<string, AppleChartEntry>();
  for (const entry of [...overall, ...genre]) {
    if (!byId.has(entry.storeAppId)) byId.set(entry.storeAppId, entry);
  }
  return byId;
}

async function snapshotMarket(db: ReturnType<typeof createDb>, market: string, snapshotDate: string): Promise<void> {
  const cc = market.toLowerCase();

  // --- Apple ---
  const [overall, genre] = await Promise.all([
    fetchAppleCharts(cc, 100),
    fetchAppleGenreCharts(cc, 100),
  ]);
  const appleChartById = uniqueAppleCharts(overall, genre);
  const appleLookups = await lookupAppleApps([...appleChartById.keys()], cc);

  let appleCount = 0;
  for (const meta of appleLookups) {
    const chart = appleChartById.get(meta.storeAppId);
    const appId = await insertAppIfAbsent(db, {
      store: "apple",
      storeAppId: meta.storeAppId,
      bundleId: meta.bundleId,
      title: meta.title,
      developer: meta.developer,
      category: meta.category,
      iconUrl: meta.iconUrl,
      description: meta.description,
      websiteUrl: meta.websiteUrl,
      price: meta.price,
      contentRating: meta.contentRating,
      languages: meta.languages,
      screenshotUrls: meta.screenshotUrls,
      releasedAt: meta.releasedAt,
      updatedAt: meta.updatedAt,
    });
    await upsertSnapshot(db, {
      appId,
      snapshotDate,
      reviewCount: meta.reviewCount,
      rating: meta.rating,
      chartRank: chart?.chartRank ?? null,
      chartCategory: chart?.chartCategory ?? null,
      chartCountry: market,
    });
    appleCount++;
  }

  // --- Google (skip markets with no Play storefront) ---
  let googleCount = 0;
  if (!NO_GOOGLE_PLAY.has(market)) {
    const googleCharts = await fetchGoogleCharts(cc, 50);
    const googleChartById = new Map(googleCharts.map((e) => [e.storeAppId, e]));
    const googleMetas = await fetchGoogleAppsMetadata(googleCharts.map((e) => e.storeAppId), cc, 150);
    for (const meta of googleMetas) {
      const chart = googleChartById.get(meta.storeAppId);
      const appId = await insertAppIfAbsent(db, {
        store: "google",
        storeAppId: meta.storeAppId,
        bundleId: meta.bundleId,
        title: meta.title,
        developer: meta.developer,
        category: meta.category,
        iconUrl: meta.iconUrl,
        description: meta.description,
        websiteUrl: meta.websiteUrl,
        price: meta.price,
        contentRating: meta.contentRating,
        screenshotUrls: meta.screenshotUrls,
        releasedAt: meta.releasedAt,
        updatedAt: meta.updatedAt,
      });
      await upsertSnapshot(db, {
        appId,
        snapshotDate,
        reviewCount: meta.reviewCount,
        rating: meta.rating,
        chartRank: chart?.chartRank ?? null,
        chartCategory: chart?.chartCategory ?? null,
        chartCountry: market,
      });
      googleCount++;
    }
  }

  console.log(`[${market}] ${appleCount} apple + ${googleCount} google charting snapshots`);
}

export async function runMarketSnapshots(markets = marketsFromEnv()): Promise<void> {
  loadEnv();
  const db = createDb();
  const snapshotDate = todaySnapshotDate();

  console.log(`Per-market charting snapshots (${snapshotDate}) for: ${markets.join(", ")}`);
  for (const market of markets) {
    try {
      await snapshotMarket(db, market, snapshotDate);
    } catch (error) {
      // One failing market must not abort the sweep.
      console.warn(`[${market}] skipped:`, error instanceof Error ? error.message : error);
    }
    await sleep(500); // brief pause between markets to stay under the Apple-IP ceiling
  }
  console.log("Per-market snapshot sweep complete.");
}

const isMain = process.argv[1]?.includes("snapshot-markets");
if (isMain) {
  runMarketSnapshots().catch((error) => {
    console.error("Market snapshot sweep failed:", error);
    process.exit(1);
  });
}

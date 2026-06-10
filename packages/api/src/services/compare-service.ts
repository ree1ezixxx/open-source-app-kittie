import { listAppsByIds, listSnapshotSeries } from "@kittie/db";
import { fetchGoogleAppMetadata, lookupAppleApp } from "@kittie/ingest";

import { getDb } from "../lib/db.js";

/* ============================================================
   Compare — 2–5 Apps side-by-side: listing fields, the latest
   Observed/Estimated metrics, and full Snapshot history for
   overlaid charts. Read-only over existing data.
   ============================================================ */

export interface CompareApp {
  id: string;
  store: string;
  storeAppId: string;
  /** Freshness contract: true when the listing fields were fetched live for
      this answer (mobile stores only); false = stored values. */
  fetchedLive: boolean;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  price: number | null;
  contentRating: string | null;
  releasedAt: Date | null;
  updatedAt: Date | null;
  screenshotCount: number;
  latest: {
    snapshotDate: string;
    reviewCount: number;
    rating: number | null;
    chartRank: number | null;
    downloadsEstimate: number | null;
    revenueEstimate: number | null;
    growthScore: number | null;
  } | null;
  history: Array<{
    date: string;
    reviewCount: number;
    rating: number | null;
    chartRank: number | null;
    downloadsEstimate: number | null;
    revenueEstimate: number | null;
    growthScore: number | null;
  }>;
}

export async function compareApps(ids: string[]): Promise<CompareApp[]> {
  const db = getDb();
  const appRows = await listAppsByIds(db, ids);

  const result: CompareApp[] = [];
  for (const a of appRows) {
    const snaps = await listSnapshotSeries(db, a.id);

    // Freshness contract: overlay the live listing on stored values (2–5
    // sequential lookups — the block is short and honest). Steam/itch rows
    // have no mobile fetcher; they keep stored values, flagged as such.
    let live: {
      title?: string;
      price?: number | null;
      contentRating?: string | null;
      screenshotUrls?: string[];
      rating?: number | null;
      reviewCount?: number;
      updatedAt?: Date | null;
    } | null = null;
    try {
      if (a.store === "apple") live = (await lookupAppleApp(a.storeAppId)) ?? null;
      else if (a.store === "google") live = await fetchGoogleAppMetadata(a.storeAppId);
    } catch {
      live = null; // store hiccup → stored values, honestly flagged
    }

    const latest = snaps.at(-1) ?? null;
    let screenshotCount = 0;
    try {
      const urls = live?.screenshotUrls ?? (a.screenshotUrls ? JSON.parse(a.screenshotUrls) : []);
      screenshotCount = Array.isArray(urls) ? urls.length : 0;
    } catch {
      screenshotCount = 0;
    }

    result.push({
      id: a.id,
      store: a.store,
      storeAppId: a.storeAppId,
      fetchedLive: live !== null,
      title: live?.title ?? a.title,
      developer: a.developer,
      category: a.category,
      iconUrl: a.iconUrl,
      price: live ? (live.price ?? null) : a.price,
      contentRating: live ? (live.contentRating ?? null) : a.contentRating,
      releasedAt: a.releasedAt,
      updatedAt: live?.updatedAt ?? a.updatedAt,
      screenshotCount,
      latest: latest
        ? {
            snapshotDate: latest.snapshotDate,
            // Observed metrics ride the live fetch when we have it; the
            // stored snapshot remains the history substrate.
            reviewCount: live?.reviewCount ?? latest.reviewCount,
            rating: live?.rating ?? latest.rating,
            chartRank: latest.chartRank,
            downloadsEstimate: latest.downloadsEstimate,
            revenueEstimate: latest.revenueEstimate,
            growthScore: latest.growthScore,
          }
        : null,
      history: snaps.map((s) => ({
        date: s.snapshotDate,
        reviewCount: s.reviewCount,
        rating: s.rating,
        chartRank: s.chartRank,
        downloadsEstimate: s.downloadsEstimate,
        revenueEstimate: s.revenueEstimate,
        growthScore: s.growthScore,
      })),
    });
  }

  // Preserve request order (UI renders columns in the order chosen).
  const byId = new Map(result.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is CompareApp => Boolean(r));
}

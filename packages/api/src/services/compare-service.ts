import { listAppsByIds, listSnapshotSeries } from "@kittie/db";

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

    const latest = snaps.at(-1) ?? null;
    let screenshotCount = 0;
    try {
      const urls = a.screenshotUrls ? JSON.parse(a.screenshotUrls) : [];
      screenshotCount = Array.isArray(urls) ? urls.length : 0;
    } catch {
      screenshotCount = 0;
    }

    result.push({
      id: a.id,
      store: a.store,
      storeAppId: a.storeAppId,
      title: a.title,
      developer: a.developer,
      category: a.category,
      iconUrl: a.iconUrl,
      price: a.price,
      contentRating: a.contentRating,
      releasedAt: a.releasedAt,
      updatedAt: a.updatedAt,
      screenshotCount,
      latest: latest
        ? {
            snapshotDate: latest.snapshotDate,
            reviewCount: latest.reviewCount,
            rating: latest.rating,
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

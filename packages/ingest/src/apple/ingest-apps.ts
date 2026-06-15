import type { Db } from "@kittie/db";

import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { sleep } from "../util/rate-limit.js";
import { lookupAppleApps } from "./lookup.js";
import type { DiscoveredApp } from "./discover.js";

export interface EnrichResult {
  /** Apps whose metadata was fetched and upserted. */
  upserted: number;
  /** Same-run snapshots written (snapshot-on-discover). */
  snapshotted: number;
  /** App IDs whose lookup batch failed. */
  failed: number;
}

export interface EnrichOptions {
  /** Snapshot day key (YYYY-MM-DD). */
  snapshotDate: string;
  /** iTunes lookup batch size (lookup.ts sub-chunks at 50/request). */
  batchSize?: number;
  /** Pause between batches, ms. */
  throttleMs?: number;
  /** Called after each upsert with the running upsert count. */
  onProgress?: (upserted: number) => void;
}

/**
 * Enrich discovered Apple app IDs and persist them end-to-end.
 *
 * For each discovered ID: fetch full metadata, upsert the app row, and write a
 * **same-run snapshot** (reviewCount, rating, chart-rank hint from discovery) so
 * the app is immediately sortable in review-ranked views like New Big Hits —
 * snapshot-on-discover. Release dates are already guarded against future dates
 * inside the lookup mapping.
 *
 * Shared by the bulk seed and the apple-discover sweep so both discovery paths
 * populate metrics the moment an app is found, with no duplicated wiring.
 */
export async function enrichAndPersistAppleApps(
  db: Db,
  discovered: DiscoveredApp[],
  opts: EnrichOptions,
): Promise<EnrichResult> {
  const { snapshotDate, batchSize = 50, throttleMs = 120, onProgress } = opts;

  const hintById = new Map(discovered.map((d) => [d.storeAppId, d]));
  const ids = discovered.map((d) => d.storeAppId);

  let upserted = 0;
  let snapshotted = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);

    let metas;
    try {
      metas = await lookupAppleApps(slice);
    } catch (err) {
      failed += slice.length;
      console.warn(`  lookup batch @${i} failed: ${(err as Error).message} — backing off`);
      await sleep(1500);
      continue;
    }

    for (const meta of metas) {
      const appId = await upsertApp(db, {
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
      upserted++;

      const hint = hintById.get(meta.storeAppId);
      await upsertSnapshot(db, {
        appId,
        snapshotDate,
        reviewCount: meta.reviewCount,
        rating: meta.rating,
        chartRank: hint?.chartRank ?? null,
        chartCategory: hint?.chartCategory ?? null,
        chartCountry: hint?.chartCountry ?? "US",
      });
      snapshotted++;
      onProgress?.(upserted);
    }

    await sleep(throttleMs);
  }

  return { upserted, snapshotted, failed };
}

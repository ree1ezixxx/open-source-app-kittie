import { apps, appSnapshots } from "@kittie/db";
import type { Db } from "@kittie/db";
import type { Store } from "@kittie/types";

import { makeAppId, makeSnapshotId } from "../util/ids.js";

export interface AppUpsertInput {
  store: Store;
  storeAppId: string;
  bundleId?: string | null;
  title: string;
  developer: string;
  category?: string | null;
  iconUrl?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  price?: number | null;
  contentRating?: string | null;
  languages?: string[];
  screenshotUrls?: string[];
  releasedAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Insert an app only if absent — never clobbers an existing row. Used by the
 * per-market snapshot sweep: non-US lookups return LOCALIZED metadata (title,
 * description), which must not overwrite the catalog's canonical (US/English)
 * app row. Existing apps keep their canonical fields; only genuinely new
 * foreign-only apps get inserted. Returns the deterministic app id either way.
 */
export async function insertAppIfAbsent(db: Db, input: AppUpsertInput): Promise<string> {
  const now = new Date();
  const id = makeAppId(input.store, input.storeAppId);

  await db
    .insert(apps)
    .values({
      id,
      store: input.store,
      storeAppId: input.storeAppId,
      bundleId: input.bundleId ?? null,
      title: input.title,
      developer: input.developer,
      category: input.category ?? null,
      iconUrl: input.iconUrl ?? null,
      description: input.description ?? null,
      websiteUrl: input.websiteUrl ?? null,
      supportEmail: null,
      price: input.price ?? null,
      contentRating: input.contentRating ?? null,
      languages: input.languages ? JSON.stringify(input.languages) : null,
      screenshotUrls: input.screenshotUrls ? JSON.stringify(input.screenshotUrls) : null,
      releasedAt: input.releasedAt ?? null,
      updatedAt: input.updatedAt ?? null,
      firstSeenAt: now,
      lastIngestedAt: now,
    })
    .onConflictDoNothing({ target: [apps.store, apps.storeAppId] });

  return id;
}

export interface SnapshotUpsertInput {
  appId: string;
  snapshotDate: string;
  reviewCount: number;
  rating?: number | null;
  chartRank?: number | null;
  chartCategory?: string | null;
  chartCountry?: string;
}

export async function upsertApp(db: Db, input: AppUpsertInput): Promise<string> {
  const now = new Date();
  const id = makeAppId(input.store, input.storeAppId);

  await db
    .insert(apps)
    .values({
      id,
      store: input.store,
      storeAppId: input.storeAppId,
      bundleId: input.bundleId ?? null,
      title: input.title,
      developer: input.developer,
      category: input.category ?? null,
      iconUrl: input.iconUrl ?? null,
      description: input.description ?? null,
      websiteUrl: input.websiteUrl ?? null,
      supportEmail: null,
      price: input.price ?? null,
      contentRating: input.contentRating ?? null,
      languages: input.languages ? JSON.stringify(input.languages) : null,
      screenshotUrls: input.screenshotUrls ? JSON.stringify(input.screenshotUrls) : null,
      releasedAt: input.releasedAt ?? null,
      updatedAt: input.updatedAt ?? null,
      firstSeenAt: now,
      lastIngestedAt: now,
    })
    .onConflictDoUpdate({
      target: [apps.store, apps.storeAppId],
      set: {
        bundleId: input.bundleId ?? null,
        title: input.title,
        developer: input.developer,
        category: input.category ?? null,
        iconUrl: input.iconUrl ?? null,
        description: input.description ?? null,
        websiteUrl: input.websiteUrl ?? null,
        price: input.price ?? null,
        contentRating: input.contentRating ?? null,
        languages: input.languages ? JSON.stringify(input.languages) : null,
        screenshotUrls: input.screenshotUrls ? JSON.stringify(input.screenshotUrls) : null,
        releasedAt: input.releasedAt ?? null,
        updatedAt: input.updatedAt ?? null,
        lastIngestedAt: now,
      },
    });

  return id;
}

export async function upsertSnapshot(db: Db, input: SnapshotUpsertInput): Promise<void> {
  const now = new Date();

  await db
    .insert(appSnapshots)
    .values({
      id: makeSnapshotId(input.appId, input.snapshotDate, input.chartCountry ?? "US"),
      appId: input.appId,
      snapshotDate: input.snapshotDate,
      reviewCount: input.reviewCount,
      rating: input.rating ?? null,
      chartRank: input.chartRank ?? null,
      chartCategory: input.chartCategory ?? null,
      chartCountry: input.chartCountry ?? "US",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [appSnapshots.appId, appSnapshots.snapshotDate, appSnapshots.chartCountry],
      set: {
        reviewCount: input.reviewCount,
        rating: input.rating ?? null,
        chartRank: input.chartRank ?? null,
        chartCategory: input.chartCategory ?? null,
        chartCountry: input.chartCountry ?? "US",
      },
    });
}

export async function listTrackedApps(db: Db) {
  return db.select().from(apps);
}

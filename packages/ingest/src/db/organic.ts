import { and, eq, isNotNull, ne } from "drizzle-orm";
import { apps, appSnapshots, organicVideos } from "@kittie/db";
import type { Db } from "@kittie/db";

import { makeOrganicVideoId } from "../util/ids.js";
import type { OrganicVideoInput } from "../organic/source.js";

/**
 * Apps that can render a full Organic card: they carry store screenshots (the
 * Listing media strip) AND have a snapshot (so the API can hydrate
 * REVENUE/INSTALLS/rating). Deterministic order so the seeded batch is stable.
 */
export async function pickAppsForOrganic(
  db: Db,
  limit: number,
): Promise<{ id: string; title: string }[]> {
  return db
    .select({ id: apps.id, title: apps.title })
    .from(apps)
    .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
    .where(and(isNotNull(apps.screenshotUrls), ne(apps.screenshotUrls, "[]")))
    .groupBy(apps.id)
    .orderBy(apps.id)
    .limit(limit);
}

/**
 * Idempotent upsert of organic videos. `firstSeenAt` is written once (on
 * insert); `lastSeenAt` moves every run so the surface stays demonstrably live.
 */
export async function upsertOrganicVideos(
  db: Db,
  rows: OrganicVideoInput[],
  now: Date,
): Promise<number> {
  for (const r of rows) {
    const id = makeOrganicVideoId(r.appId, r.ordinal);
    await db
      .insert(organicVideos)
      .values({
        id,
        appId: r.appId,
        creatorHandle: r.creatorHandle,
        platform: r.platform,
        videoUrl: r.videoUrl,
        thumbnailUrl: r.thumbnailUrl,
        caption: r.caption,
        postedAt: r.postedAt,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: organicVideos.id,
        set: {
          creatorHandle: r.creatorHandle,
          platform: r.platform,
          videoUrl: r.videoUrl,
          thumbnailUrl: r.thumbnailUrl,
          caption: r.caption,
          postedAt: r.postedAt,
          lastSeenAt: now,
        },
      });
  }
  return rows.length;
}

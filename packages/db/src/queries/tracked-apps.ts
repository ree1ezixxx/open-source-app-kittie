import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Store } from "@kittie/types";

import type { Db } from "../client.js";
import { apps, trackedAppKeywords, trackedApps } from "../schema.js";

/** A tracked app joined to its store-listing metadata. */
export interface TrackedAppEntry {
  /** tracked_apps row id */
  id: string;
  /** apps.id — the store-listing identity */
  appId: string;
  store: Store;
  country: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
  addedAt: Date;
  /** AI-generated keyword count — zero until slice #23 runs. */
  generatedKeywordCount: number;
  /** When rank analysis last ran — null until slice #24 runs. */
  lastAnalyzedAt: Date | null;
}

/**
 * Track an app. Idempotent on (appId, store, country) — adding the same app
 * twice is a no-op (unique index). Returns nothing; read back via list.
 */
export async function trackApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
  await db
    .insert(trackedApps)
    .values({ id: randomUUID(), appId, store, country, addedAt: new Date() })
    .onConflictDoNothing({
      target: [trackedApps.appId, trackedApps.store, trackedApps.country],
    });
}

/** Look up the persisted tracked-app row for one app/store/country identity. */
export async function getTrackedApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
) {
  const [row] = await db
    .select()
    .from(trackedApps)
    .where(
      and(
        eq(trackedApps.appId, appId),
        eq(trackedApps.store, store),
        eq(trackedApps.country, country),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Replace the generated keyword set for a tracked app and sync its count. */
export async function replaceGeneratedKeywordsForTrackedApp(
  db: Db,
  input: {
    trackedAppId: string;
    appId: string;
    store: Store;
    country: string;
    inputHash: string;
    keywords: string[];
  },
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(trackedAppKeywords)
      .where(eq(trackedAppKeywords.trackedAppId, input.trackedAppId));

    if (input.keywords.length > 0) {
      await tx.insert(trackedAppKeywords).values(
        input.keywords.map((keyword) => ({
          id: randomUUID(),
          trackedAppId: input.trackedAppId,
          appId: input.appId,
          store: input.store,
          country: input.country,
          keyword,
          inputHash: input.inputHash,
          source: "ai",
          createdAt: now,
        })),
      );
    }

    await tx
      .update(trackedApps)
      .set({ generatedKeywordCount: input.keywords.length })
      .where(eq(trackedApps.id, input.trackedAppId));
  });
}

/** The metadata hash currently backing this tracked app's generated set. */
export async function getGeneratedKeywordInputHash(
  db: Db,
  trackedAppId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ inputHash: trackedAppKeywords.inputHash })
    .from(trackedAppKeywords)
    .where(eq(trackedAppKeywords.trackedAppId, trackedAppId))
    .limit(1);
  return row?.inputHash ?? null;
}

/** Delete generated keywords before removing the tracked-app row. */
export async function deleteGeneratedKeywordsForTrackedApp(
  db: Db,
  trackedAppId: string,
): Promise<void> {
  await db
    .delete(trackedAppKeywords)
    .where(eq(trackedAppKeywords.trackedAppId, trackedAppId));
}

/** Remove an app from the tracked list. */
export async function untrackApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
  const tracked = await getTrackedApp(db, appId, store, country);
  if (tracked) await deleteGeneratedKeywordsForTrackedApp(db, tracked.id);

  await db
    .delete(trackedApps)
    .where(
      and(
        eq(trackedApps.appId, appId),
        eq(trackedApps.store, store),
        eq(trackedApps.country, country),
      ),
    );
}

/** The full tracked-apps list with current store metadata, newest first. */
export async function listTrackedApps(db: Db): Promise<TrackedAppEntry[]> {
  const rows = await db
    .select({ t: trackedApps, a: apps })
    .from(trackedApps)
    .innerJoin(apps, eq(trackedApps.appId, apps.id))
    .orderBy(desc(trackedApps.addedAt));

  return rows.map(({ t, a }) => ({
    id: t.id,
    appId: t.appId,
    store: t.store as Store,
    country: t.country,
    title: a.title,
    developer: a.developer,
    iconUrl: a.iconUrl,
    category: a.category,
    addedAt: t.addedAt,
    generatedKeywordCount: t.generatedKeywordCount,
    lastAnalyzedAt: t.lastAnalyzedAt,
  }));
}

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Store } from "@kittie/types";

import type { Db } from "../client.js";
import { apps, trackedApps } from "../schema.js";

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

/** Remove an app from the tracked list. */
export async function untrackApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
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

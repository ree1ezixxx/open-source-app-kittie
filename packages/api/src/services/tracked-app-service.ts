import {
  getAppRowById,
  listTrackedApps,
  trackApp as dbTrackApp,
  untrackApp as dbUntrackApp,
  type TrackedAppEntry,
} from "@kittie/db";
import type { Store } from "@kittie/types";

import { getDb } from "../lib/db.js";

/** The durable tracked-apps list (survives reload). PRD #20 / slice #22. */
export async function listTracked(): Promise<TrackedAppEntry[]> {
  return listTrackedApps(getDb());
}

/**
 * Add an app to the tracked list. Persists the app only — no keyword
 * generation or rank ingestion (slices #23/#24). Idempotent on
 * (appId, store, country). Returns the entry, or null if the app id is unknown.
 */
export async function addTrackedApp(
  appId: string,
  country: string,
): Promise<TrackedAppEntry | null> {
  const db = getDb();
  const app = await getAppRowById(db, appId);
  if (!app) return null;
  await dbTrackApp(db, appId, app.store as Store, country);
  const all = await listTrackedApps(db);
  return all.find((e) => e.appId === appId && e.country === country) ?? null;
}

export async function removeTrackedApp(
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
  await dbUntrackApp(getDb(), appId, store, country);
}

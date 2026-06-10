import { syncGoogleReviews, syncAppleReviews, type SyncOpts } from "@kittie/ingest";

import { getDb } from "../lib/db.js";
import { getAppByIdFromDb } from "./db-app-service.js";

export interface ReviewSyncResult {
  /** Number of NEW reviews pulled and stored this run. */
  synced: number;
  /** Widened for multi-store rows — the unsupported path reports them as-is. */
  store: string;
  /** false when the store's live fetch isn't wired (both mobile stores are live). */
  supported: boolean;
}

/** Real progress milestones for the on-add SSE stream. All optional so the
    plain Refresh path can ignore them. */
export interface SyncCallbacks {
  onProgress?: SyncOpts["onProgress"];
  onAnalyse?: SyncOpts["onAnalyse"];
  onSave?: SyncOpts["onSave"];
}

/**
 * On-demand live review pull for one app — what the "Refresh" button, the
 * add-to-monitoring SSE flow, and the continuous sweep all call. Looks up the
 * app's store + native id, fetches the latest written reviews, classifies and
 * upserts them. Both Google and Apple are live (token-free endpoints).
 */
export async function syncAppReviews(
  appId: string,
  cb: SyncCallbacks = {},
): Promise<ReviewSyncResult | null> {
  const app = await getAppByIdFromDb(appId);
  if (!app) return null;

  const opts: SyncOpts = {
    country: app.store === "apple" ? "us" : undefined,
    onProgress: cb.onProgress,
    onAnalyse: cb.onAnalyse,
    onSave: cb.onSave,
  };

  if (app.store === "google") {
    const synced = await syncGoogleReviews(getDb(), app.storeAppId, opts);
    return { synced, store: "google", supported: true };
  }

  if (app.store === "apple") {
    const synced = await syncAppleReviews(getDb(), app.storeAppId, opts);
    return { synced, store: "apple", supported: true };
  }

  return { synced: 0, store: app.store, supported: false };
}

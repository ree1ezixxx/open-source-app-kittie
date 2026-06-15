import gplay from "google-play-scraper";

import type { Db } from "@kittie/db";

import { upsertReviews, type ReviewUpsertInput } from "../db/reviews.js";
import type { SyncOpts } from "../apple/reviews.js";
import { makeAppId } from "../util/ids.js";
import { sleep } from "../util/rate-limit.js";

/** Runtime enum object — the package's TS types don't expose the values. */
const gplaySort = (gplay as typeof gplay & { sort: { NEWEST: number } }).sort;

interface GoogleReview {
  id: string;
  userName?: string;
  date?: string | Date;
  score?: number;
  title?: string | null;
  text?: string | null;
}

/**
 * Fetch the latest *written* reviews for a Google Play app and store them.
 *
 * Mirrors appkittie's pipeline: pull the most-recent ~500 reviews (paginated,
 * ~150/page), keep only those with body text ("written reviews only"), and
 * upsert by a stable store-derived id so re-runs only add new ones. Returns the
 * number of NEW reviews inserted this run.
 */
export async function syncGoogleReviews(
  db: Db,
  storeAppId: string,
  opts: SyncOpts = {},
): Promise<number> {
  const country = (opts.country ?? "us").toLowerCase();
  const max = opts.max ?? 500;
  const appId = makeAppId("google", storeAppId);

  const collected: ReviewUpsertInput[] = [];
  let token: string | undefined;

  while (collected.length < max) {
    const res = (await gplay.reviews({
      appId: storeAppId,
      sort: gplaySort.NEWEST,
      country,
      num: Math.min(150, max - collected.length),
      paginate: true,
      ...(token ? { nextPaginationToken: token } : {}),
    })) as { data: GoogleReview[]; nextPaginationToken?: string } | GoogleReview[];

    const batch = Array.isArray(res) ? res : res.data;
    token = Array.isArray(res) ? undefined : res.nextPaginationToken;
    if (!batch || batch.length === 0) break;

    for (const r of batch) {
      const body = (r.text ?? "").trim();
      if (!body) continue; // written reviews only
      collected.push({
        id: `google:${storeAppId}:${r.id}`,
        appId,
        store: "google",
        country: country.toUpperCase(),
        rating: Math.round(r.score ?? 0),
        title: r.title?.trim() || null,
        body,
        author: r.userName ?? null,
        reviewedAt: r.date ? new Date(r.date) : new Date(),
      });
    }

    opts.onProgress?.(collected.length);

    if (!token) break;
    await sleep(180); // be polite to the scraper
  }

  return upsertReviews(db, collected.slice(0, max), {
    onAnalyse: opts.onAnalyse,
    onSave: opts.onSave,
  });
}

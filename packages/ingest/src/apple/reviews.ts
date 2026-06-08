import type { Db } from "@kittie/db";

import { upsertReviews, type ReviewUpsertInput } from "../db/reviews.js";
import { makeAppId } from "../util/ids.js";
import { sleep } from "../util/rate-limit.js";

/* ----------------------------------------------------------------
   Apple review sync — token-free public catalog endpoint.

   apps.apple.com/api/apps/v1/catalog/{cc}/apps/{id}/reviews
   No bearer token, no key (the old amp-api host needed one; the legacy
   RSS feed is dead). JSON:API shape: { data: [{ id, attributes }], next }.
   We page by offset until empty / `max`, keep written reviews only, and
   upsert by a stable store-derived id so re-runs only add new ones.
   ---------------------------------------------------------------- */

const PAGE = 20; // endpoint's max page size

interface AppleReviewAttributes {
  date?: string;
  rating?: number;
  title?: string;
  review?: string;
  userName?: string;
}
interface AppleReviewResource {
  id: string;
  attributes?: AppleReviewAttributes;
}
interface AppleReviewsResponse {
  data?: AppleReviewResource[];
  next?: string | null;
}

export interface SyncOpts {
  country?: string;
  max?: number;
  /** Called after each page with the running count of fetched reviews. */
  onProgress?: (fetched: number) => void;
  /** Fired when classification begins (row count). */
  onAnalyse?: (total: number) => void;
  /** Fired when rows are written (count of NEW rows). */
  onSave?: (inserted: number) => void;
}

export async function syncAppleReviews(
  db: Db,
  storeAppId: string,
  opts: SyncOpts = {},
): Promise<number> {
  const cc = (opts.country ?? "us").toLowerCase();
  const max = opts.max ?? 500;
  const appId = makeAppId("apple", storeAppId);

  const collected: ReviewUpsertInput[] = [];
  let offset = 0;

  while (collected.length < max) {
    const url =
      `https://apps.apple.com/api/apps/v1/catalog/${cc}/apps/${storeAppId}/reviews` +
      `?platform=web&additionalPlatforms=appletv,ipad,iphone,mac&l=en-US` +
      `&offset=${offset}&limit=${PAGE}&sort=mostRecent`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        },
      });
    } catch {
      break; // network hiccup — stop the run, keep what we have
    }
    if (!res.ok) break;

    const json = (await res.json()) as AppleReviewsResponse;
    const batch = json.data ?? [];
    if (batch.length === 0) break;

    for (const r of batch) {
      const a = r.attributes ?? {};
      const body = (a.review ?? "").trim();
      if (!body) continue; // written reviews only
      collected.push({
        id: `apple:${storeAppId}:${r.id}`,
        appId,
        store: "apple",
        country: cc.toUpperCase(),
        rating: Math.round(a.rating ?? 0),
        title: a.title?.trim() || null,
        body,
        author: a.userName ?? null,
        reviewedAt: a.date ? new Date(a.date) : new Date(),
      });
    }

    opts.onProgress?.(collected.length);

    if (!json.next) break; // Apple stops paginating
    offset += PAGE;
    await sleep(180); // be polite
  }

  return upsertReviews(db, collected.slice(0, max), {
    onAnalyse: opts.onAnalyse,
    onSave: opts.onSave,
  });
}

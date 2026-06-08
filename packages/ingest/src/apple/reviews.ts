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

/** Raised when Apple throttles us and a page can't be fetched after retries.
    The caller surfaces this honestly instead of reporting a false "0 new". */
export class StoreRateLimitedError extends Error {
  constructor() {
    super("Apple is rate-limiting reviews right now — try again in a moment.");
    this.name = "StoreRateLimitedError";
  }
}

type PageOutcome = { ok: true; json: AppleReviewsResponse } | { ok: false; retryable: boolean };

/** Fetch one page with backoff on 429 / 5xx / network errors. A non-retryable
    non-OK status (e.g. 404) is treated as "no data here", not a failure. */
async function fetchApplePage(url: string, attempts = 3): Promise<PageOutcome> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(600 * 2 ** i); // 600ms → 1.2s → 2.4s
        continue;
      }
      if (!res.ok) return { ok: false, retryable: false }; // 404 etc → genuinely no data
      return { ok: true, json: (await res.json()) as AppleReviewsResponse };
    } catch {
      await sleep(600 * 2 ** i); // network blip → back off and retry
    }
  }
  return { ok: false, retryable: true }; // exhausted retries → throttled
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

    const outcome = await fetchApplePage(url);
    if (!outcome.ok) {
      // Throttled and we have nothing yet → fail loudly so the UI doesn't
      // mistake a blocked fetch for "already up to date".
      if (outcome.retryable && collected.length === 0) throw new StoreRateLimitedError();
      break; // non-retryable (no data) OR partial pull — keep what we have
    }

    const batch = outcome.json.data ?? [];
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

    if (!outcome.json.next) break; // Apple stops paginating
    offset += PAGE;
    await sleep(320); // Apple throttles hard — pace pages more politely than Google
  }

  return upsertReviews(db, collected.slice(0, max), {
    onAnalyse: opts.onAnalyse,
    onSave: opts.onSave,
  });
}

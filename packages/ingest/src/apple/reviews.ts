import { sleep } from "../util/rate-limit.js";

export interface AppleReview {
  externalId: string;
  rating: number;
  title: string | null;
  body: string;
  author: string | null;
  reviewedAt: Date;
}

interface AppleReviewFeed {
  feed?: {
    entry?: Array<{
      id?: { label?: string };
      title?: { label?: string };
      content?: { label?: string };
      author?: { name?: { label?: string } };
      updated?: { label?: string };
      "im:rating"?: { label?: string };
    }>;
  };
}

export interface FetchAppleReviewsOptions {
  storeAppId: string;
  country?: string;
  maxReviews?: number;
  maxPages?: number;
  pageDelayMs?: number;
}

export async function fetchAppleReviews(
  options: FetchAppleReviewsOptions,
): Promise<AppleReview[]> {
  const {
    storeAppId,
    country = "us",
    maxReviews = 50,
    maxPages = 5,
    pageDelayMs = 200,
  } = options;

  const collected: AppleReview[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages && collected.length < maxReviews; page++) {
    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${storeAppId}/sortby=mostrecent/json`;
    const response = await fetch(url, { redirect: "follow" });

    if (!response.ok) break;

    const data = (await response.json()) as AppleReviewFeed;
    const entries = data.feed?.entry ?? [];
    if (entries.length === 0) break;

    let addedThisPage = 0;

    for (const entry of entries) {
      const externalId = entry.id?.label;
      const rating = Number(entry["im:rating"]?.label);
      const body = entry.content?.label?.trim();

      if (!externalId || !Number.isFinite(rating) || !body) continue;
      if (seen.has(externalId)) continue;

      seen.add(externalId);
      collected.push({
        externalId,
        rating,
        title: entry.title?.label?.trim() ?? null,
        body,
        author: entry.author?.name?.label?.trim() ?? null,
        reviewedAt: entry.updated?.label ? new Date(entry.updated.label) : new Date(),
      });
      addedThisPage++;

      if (collected.length >= maxReviews) break;
    }

    if (addedThisPage === 0) break;
    if (page < maxPages && collected.length < maxReviews) {
      await sleep(pageDelayMs);
    }
  }

  return collected;
}

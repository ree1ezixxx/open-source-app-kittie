import gplay from "google-play-scraper";

const gplaySort = gplay as typeof gplay & { sort: { NEWEST: number } };

export interface GoogleReview {
  externalId: string;
  rating: number;
  title: string | null;
  body: string;
  author: string | null;
  reviewedAt: Date;
}

export interface FetchGoogleReviewsOptions {
  storeAppId: string;
  country?: string;
  maxReviews?: number;
}

export async function fetchGoogleReviews(
  options: FetchGoogleReviewsOptions,
): Promise<GoogleReview[]> {
  const { storeAppId, country = "us", maxReviews = 50 } = options;

  const result = await gplay.reviews({
    appId: storeAppId,
    country,
    num: maxReviews,
    paginate: false,
    sort: gplaySort.sort.NEWEST,
  } as Parameters<typeof gplay.reviews>[0]);

  return result.data.map((review) => ({
    externalId: review.id,
    rating: review.score,
    title: review.title?.trim() ?? null,
    body: review.text?.trim() ?? "",
    author: review.userName?.trim() ?? null,
    reviewedAt: review.date ? new Date(review.date) : new Date(),
  })).filter((review) => review.body.length > 0);
}

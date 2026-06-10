import { reviews } from "@kittie/db";
import type { Db } from "@kittie/db";
import type { Store } from "@kittie/types";

export interface ReviewUpsertInput {
  id: string;
  appId: string;
  store: Store;
  country: string;
  rating: number;
  title?: string | null;
  body: string;
  author?: string | null;
  reviewedAt: Date;
}

export async function upsertReviews(db: Db, items: ReviewUpsertInput[]): Promise<number> {
  if (items.length === 0) return 0;

  const now = new Date();

  for (const item of items) {
    await db
      .insert(reviews)
      .values({
        id: item.id,
        appId: item.appId,
        store: item.store,
        country: item.country,
        rating: item.rating,
        title: item.title ?? null,
        body: item.body,
        author: item.author ?? null,
        reviewedAt: item.reviewedAt,
        ingestedAt: now,
      })
      .onConflictDoUpdate({
        target: reviews.id,
        set: {
          rating: item.rating,
          title: item.title ?? null,
          body: item.body,
          author: item.author ?? null,
          reviewedAt: item.reviewedAt,
          ingestedAt: now,
        },
      });
  }

  return items.length;
}

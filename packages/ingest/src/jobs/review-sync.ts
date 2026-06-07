#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";

import { fetchAppleReviews } from "../apple/reviews.js";
import { listTrackedApps } from "../db/apps.js";
import { upsertReviews } from "../db/reviews.js";
import { fetchGoogleReviews } from "../google/reviews.js";
import { makeReviewId } from "../util/review-id.js";
import { sleep } from "../util/rate-limit.js";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function runReviewSync(): Promise<void> {
  loadEnv();
  const db = createDb();

  const perApp = envInt("REVIEW_SYNC_PER_APP", 25);
  const appLimit = envInt("REVIEW_SYNC_APP_LIMIT", 0);
  const googleDelayMs = envInt("REVIEW_SYNC_GOOGLE_DELAY_MS", 150);

  let tracked = await listTrackedApps(db);
  if (appLimit > 0) tracked = tracked.slice(0, appLimit);

  console.log(`Syncing up to ${perApp} reviews for ${tracked.length} apps…`);

  let totalReviews = 0;
  let appsSynced = 0;
  let failed = 0;

  for (const app of tracked) {
    try {
      const country = "US";
      const rows =
        app.store === "apple"
          ? (await fetchAppleReviews({
              storeAppId: app.storeAppId,
              country: "us",
              maxReviews: perApp,
            })).map((review) => ({
              id: makeReviewId("apple", review.externalId),
              appId: app.id,
              store: "apple" as const,
              country,
              rating: review.rating,
              title: review.title,
              body: review.body,
              author: review.author,
              reviewedAt: review.reviewedAt,
            }))
          : (await fetchGoogleReviews({
              storeAppId: app.storeAppId,
              country: "us",
              maxReviews: perApp,
            })).map((review) => ({
              id: makeReviewId("google", review.externalId),
              appId: app.id,
              store: "google" as const,
              country,
              rating: review.rating,
              title: review.title,
              body: review.body,
              author: review.author,
              reviewedAt: review.reviewedAt,
            }));

      const written = await upsertReviews(db, rows);
      totalReviews += written;
      appsSynced++;

      if (app.store === "google" && googleDelayMs > 0) {
        await sleep(googleDelayMs);
      }
    } catch (error) {
      console.warn(`  skip ${app.id}:`, error);
      failed++;
    }
  }

  console.log(`\nReview sync complete: ${totalReviews} reviews from ${appsSynced} apps (${failed} skipped)`);
}

const isMain = process.argv[1]?.includes("review-sync");
if (isMain) {
  runReviewSync().catch((error) => {
    console.error("Review sync failed:", error);
    process.exit(1);
  });
}

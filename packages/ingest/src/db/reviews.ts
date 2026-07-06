import { eq, gt, isNull } from "drizzle-orm";
import { reviews } from "@kittie/db";
import type { Db } from "@kittie/db";
import type { Store } from "@kittie/types";
import { classifyReview } from "@kittie/intelligence";

export interface ReviewUpsertInput {
  /** Stable, store-derived id so re-syncs are idempotent. */
  id: string;
  appId: string;
  store: Store;
  country: string;
  rating: number;
  title: string | null;
  body: string;
  author: string | null;
  reviewedAt: Date;
}

/** Real progress boundaries the on-add SSE stream reports (no faked timers). */
export interface UpsertStageEvents {
  /** Fired once classification is about to run, with the row count. */
  onAnalyse?: (total: number) => void;
  /** Fired once rows are written, with the count of NEW rows. */
  onSave?: (inserted: number) => void;
}

/**
 * Insert review rows, skipping any whose id already exists. Returns the count
 * of *newly* inserted rows — so a daily re-sync reports only the fresh pickups
 * (mirrors appkittie's "600 → 607" drift). Chunked to stay under SQLite's
 * bound-parameter limit.
 */
export async function upsertReviews(
  db: Db,
  rows: ReviewUpsertInput[],
  stages: UpsertStageEvents = {},
): Promise<number> {
  if (rows.length === 0) {
    stages.onAnalyse?.(0);
    stages.onSave?.(0);
    return 0;
  }
  const now = new Date();
  const CHUNK = 200;
  let inserted = 0;

  stages.onAnalyse?.(rows.length);

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map((r) => {
      // Classify once, at ingest — the seam. Tags are persisted so every
      // surface reads them straight from the row (no render-time classifier).
      const tags = classifyReview({ rating: r.rating, title: r.title, body: r.body });
      return {
        ...r,
        ingestedAt: now,
        sentiment: tags.sentiment,
        topics: JSON.stringify(tags.topics),
        improvementAreas: JSON.stringify(tags.improvementAreas),
      };
    });
    const res = await db
      .insert(reviews)
      .values(slice)
      .onConflictDoNothing()
      .returning({ id: reviews.id });
    inserted += res.length;
  }

  stages.onSave?.(inserted);
  return inserted;
}

/**
 * One-time / idempotent backfill — classify and persist tags for any review
 * row left untagged (sentiment IS NULL), e.g. everything ingested before the
 * classifier seam landed. Re-running is cheap once the corpus is tagged.
 * Returns the number of rows updated.
 */
export async function backfillReviewTags(db: Db, batch = 1000): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db
      .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body })
      .from(reviews)
      .where(isNull(reviews.sentiment))
      .limit(batch);
    if (rows.length === 0) break;

    for (const r of rows) {
      const tags = classifyReview({ rating: r.rating, title: r.title, body: r.body });
      await db
        .update(reviews)
        .set({
          sentiment: tags.sentiment,
          topics: JSON.stringify(tags.topics),
          improvementAreas: JSON.stringify(tags.improvementAreas),
        })
        .where(eq(reviews.id, r.id));
    }
    total += rows.length;
  }
  return total;
}

/** Per-label tag counts across the whole corpus — the re-tag before/after report. */
export interface TagDistribution {
  rows: number;
  topics: Record<string, number>;
  improvementAreas: Record<string, number>;
}

/**
 * FORCE re-tag — re-run the classifier over EVERY stored review and overwrite
 * stale tags (unlike {@link backfillReviewTags}, which only fills nulls). This
 * is how a classifier fix (e.g. the #266 word-boundary change) propagates to
 * rows tagged under the old rules. Keyset-paginated by id so it is resumable
 * and bounded-memory at any corpus size. Returns before/after distributions so
 * the caller can report the shift instead of asserting it blind.
 */
export async function retagAllReviews(
  db: Db,
  batch = 1000,
): Promise<{ retagged: number; before: TagDistribution; after: TagDistribution }> {
  const before = await tagDistribution(db);
  let retagged = 0;
  let cursor = "";
  for (;;) {
    const rows = await db
      .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body })
      .from(reviews)
      .where(gt(reviews.id, cursor))
      .orderBy(reviews.id)
      .limit(batch);
    if (rows.length === 0) break;
    for (const r of rows) {
      const tags = classifyReview({ rating: r.rating, title: r.title, body: r.body });
      await db
        .update(reviews)
        .set({
          sentiment: tags.sentiment,
          topics: JSON.stringify(tags.topics),
          improvementAreas: JSON.stringify(tags.improvementAreas),
        })
        .where(eq(reviews.id, r.id));
      retagged += 1;
    }
    cursor = rows[rows.length - 1]!.id;
  }
  const after = await tagDistribution(db);
  return { retagged, before, after };
}

/** Count rows per tag label (reads persisted JSON arrays; log counts, not payloads). */
export async function tagDistribution(db: Db): Promise<TagDistribution> {
  const topics: Record<string, number> = {};
  const improvementAreas: Record<string, number> = {};
  let count = 0;
  let cursor = "";
  for (;;) {
    const rows = await db
      .select({ id: reviews.id, topics: reviews.topics, improvementAreas: reviews.improvementAreas })
      .from(reviews)
      .where(gt(reviews.id, cursor))
      .orderBy(reviews.id)
      .limit(2000);
    if (rows.length === 0) break;
    for (const r of rows) {
      count += 1;
      for (const t of safeTagArr(r.topics)) topics[t] = (topics[t] ?? 0) + 1;
      for (const a of safeTagArr(r.improvementAreas)) improvementAreas[a] = (improvementAreas[a] ?? 0) + 1;
    }
    cursor = rows[rows.length - 1]!.id;
  }
  return { rows: count, topics, improvementAreas };
}

function safeTagArr(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

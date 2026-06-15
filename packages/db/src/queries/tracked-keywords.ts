import { randomUUID } from "node:crypto";
import { desc, eq, lt } from "drizzle-orm";
import type { KeywordDifficulty, Store } from "@kittie/types";

import type { Db } from "../client.js";
import { keywords, trackedKeywords } from "../schema.js";
import { keywordRowToDifficulty, type KeywordRow } from "./keywords.js";

/** A tracked keyword joined to its current lookup metrics. */
export interface TrackedKeywordEntry {
  /** tracked_keywords row id */
  id: string;
  /** keywords.id — the stable deep-link identity */
  keywordId: string;
  keyword: string;
  country: string;
  store: Store;
  note: string | null;
  trackedAt: Date;
  /** Current metrics from the lookup cache row (null if never scored). */
  metrics: KeywordDifficulty | null;
}

/** Add a keyword (by its lookup id) to the shortlist. Idempotent. */
export async function trackKeyword(db: Db, keywordId: string, note?: string | null): Promise<void> {
  await db
    .insert(trackedKeywords)
    .values({ id: randomUUID(), keywordId, note: note ?? null, trackedAt: new Date() })
    .onConflictDoNothing({ target: trackedKeywords.keywordId });
}

/** Remove a keyword from the shortlist. */
export async function untrackKeyword(db: Db, keywordId: string): Promise<void> {
  await db.delete(trackedKeywords).where(eq(trackedKeywords.keywordId, keywordId));
}

export async function isKeywordTracked(db: Db, keywordId: string): Promise<boolean> {
  const rows = await db
    .select({ id: trackedKeywords.id })
    .from(trackedKeywords)
    .where(eq(trackedKeywords.keywordId, keywordId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Tracked keywords whose lookup row is older than `maxAgeDays` — the
 * freshness scheduler's re-score sweep feeds these back through the lookup
 * path, which refetches on stale TTL (Greece-safe: works after any downtime).
 */
export async function listStaleTrackedKeywords(
  db: Db,
  maxAgeDays = 7,
): Promise<Array<{ keyword: string; country: string; store: Store }>> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000);
  const rows = await db
    .select({ keyword: keywords.keyword, country: keywords.country, store: keywords.store })
    .from(trackedKeywords)
    .innerJoin(keywords, eq(trackedKeywords.keywordId, keywords.id))
    .where(lt(keywords.computedAt, cutoff));
  return rows.map((r) => ({ ...r, store: r.store as Store }));
}

/** The full shortlist with current metrics, newest tracked first. */
export async function listTrackedKeywords(db: Db): Promise<TrackedKeywordEntry[]> {
  const rows = await db
    .select({ t: trackedKeywords, k: keywords })
    .from(trackedKeywords)
    .innerJoin(keywords, eq(trackedKeywords.keywordId, keywords.id))
    .orderBy(desc(trackedKeywords.trackedAt));

  return rows.map(({ t, k }) => ({
    id: t.id,
    keywordId: t.keywordId,
    keyword: k.keyword,
    country: k.country,
    store: k.store as Store,
    note: t.note,
    trackedAt: t.trackedAt,
    metrics: keywordRowToDifficulty(k as KeywordRow),
  }));
}

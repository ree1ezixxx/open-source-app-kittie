import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Store } from "@kittie/types";

import type { Db } from "../client.js";
import { apps, keywordRankings, keywords, trackedAppKeywords, trackedApps } from "../schema.js";
import { keywordRowToDifficulty, makeKeywordLookupId, type KeywordRow } from "./keywords.js";

/** A tracked app joined to its store-listing metadata. */
export interface TrackedAppEntry {
  /** tracked_apps row id */
  id: string;
  /** apps.id — the store-listing identity */
  appId: string;
  storeAppId: string;
  store: Store;
  country: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
  addedAt: Date;
  /** AI-generated keyword count — zero until slice #23 runs. */
  generatedKeywordCount: number;
  /** When rank analysis last ran — null until slice #24 runs. */
  lastAnalyzedAt: Date | null;
}

export interface GeneratedTrackedAppKeyword {
  id: string;
  trackedAppId: string;
  appId: string;
  store: Store;
  country: string;
  keyword: string;
  source: string;
  createdAt: Date;
}

export interface TrackedAppKeywordRankingEntry {
  keywordId: string;
  keyword: string;
  country: string;
  store: Store;
  position: number | null;
  growth: number | null;
  observedAt: Date | null;
  popularity: number | null;
  difficulty: number | null;
  trafficScore: number | null;
  opportunityScore: number | null;
  competingAppCount: number | null;
  topApps: Array<{
    title: string;
    iconUrl: string | null;
    reviewCount: number;
    rating: number | null;
    rank: number;
  }>;
}

export interface PositionHistoryPoint {
  date: string;
  position: number | null;
  delta: number | null;
}

export interface TrackedAppPositionSeries {
  keywordId: string;
  keyword: string;
  country: string;
  store: Store;
  points: PositionHistoryPoint[];
}

export function keywordIdsForGeneratedKeywords(
  generated: GeneratedTrackedAppKeyword[],
  country?: string,
): string[] {
  const market = country?.toUpperCase();
  return generated.map((row) => makeKeywordLookupId(row.store, market ?? row.country, row.keyword));
}

/**
 * Track an app. Idempotent on (appId, store, country) — adding the same app
 * twice is a no-op (unique index). Returns nothing; read back via list.
 */
export async function trackApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
  await db
    .insert(trackedApps)
    .values({ id: randomUUID(), appId, store, country, addedAt: new Date() })
    .onConflictDoNothing({
      target: [trackedApps.appId, trackedApps.store, trackedApps.country],
    });
}

/** Look up the persisted tracked-app row for one app/store/country identity. */
export async function getTrackedApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
) {
  const [row] = await db
    .select()
    .from(trackedApps)
    .where(
      and(
        eq(trackedApps.appId, appId),
        eq(trackedApps.store, store),
        eq(trackedApps.country, country),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Look up one persisted tracked app by row id, joined to app metadata. */
export async function getTrackedAppById(db: Db, trackedAppId: string): Promise<TrackedAppEntry | null> {
  const [row] = await db
    .select({ t: trackedApps, a: apps })
    .from(trackedApps)
    .innerJoin(apps, eq(trackedApps.appId, apps.id))
    .where(eq(trackedApps.id, trackedAppId))
    .limit(1);

  if (!row) return null;
  const { t, a } = row;
  return {
    id: t.id,
    appId: t.appId,
    storeAppId: a.storeAppId,
    store: t.store as Store,
    country: t.country,
    title: a.title,
    developer: a.developer,
    iconUrl: a.iconUrl,
    category: a.category,
    addedAt: t.addedAt,
    generatedKeywordCount: t.generatedKeywordCount,
    lastAnalyzedAt: t.lastAnalyzedAt,
  };
}

/** Replace the generated keyword set for a tracked app and sync its count. */
export async function replaceGeneratedKeywordsForTrackedApp(
  db: Db,
  input: {
    trackedAppId: string;
    appId: string;
    store: Store;
    country: string;
    inputHash: string;
    keywords: string[];
  },
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(trackedAppKeywords)
      .where(
        and(
          eq(trackedAppKeywords.trackedAppId, input.trackedAppId),
          eq(trackedAppKeywords.source, "ai"),
        ),
      );

    if (input.keywords.length > 0) {
      await tx.insert(trackedAppKeywords).values(
        input.keywords.map((keyword) => ({
          id: randomUUID(),
          trackedAppId: input.trackedAppId,
          appId: input.appId,
          store: input.store,
          country: input.country,
          keyword,
          inputHash: input.inputHash,
          source: "ai",
          createdAt: now,
        })),
      );
    }

    const rows = await tx
      .select({ id: trackedAppKeywords.id })
      .from(trackedAppKeywords)
      .where(eq(trackedAppKeywords.trackedAppId, input.trackedAppId));

    await tx
      .update(trackedApps)
      .set({ generatedKeywordCount: rows.length })
      .where(eq(trackedApps.id, input.trackedAppId));
  });
}

/** Add one user-supplied keyword to a tracked app without replacing AI keywords. */
export async function addKeywordForTrackedApp(
  db: Db,
  input: {
    trackedAppId: string;
    appId: string;
    store: Store;
    country: string;
    keyword: string;
    inputHash: string;
    source: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const country = input.country.toUpperCase();
    const existing = await tx
      .select({ id: trackedAppKeywords.id })
      .from(trackedAppKeywords)
      .where(
        and(
          eq(trackedAppKeywords.trackedAppId, input.trackedAppId),
          eq(trackedAppKeywords.country, country),
          eq(trackedAppKeywords.keyword, input.keyword),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await tx
        .insert(trackedAppKeywords)
        .values({
          id: randomUUID(),
          trackedAppId: input.trackedAppId,
          appId: input.appId,
          store: input.store,
          country,
          keyword: input.keyword,
          inputHash: input.inputHash,
          source: input.source,
          createdAt: new Date(),
        });
    }

    const rows = await tx
      .select({ id: trackedAppKeywords.id })
      .from(trackedAppKeywords)
      .where(eq(trackedAppKeywords.trackedAppId, input.trackedAppId));

    await tx
      .update(trackedApps)
      .set({ generatedKeywordCount: rows.length })
      .where(eq(trackedApps.id, input.trackedAppId));
  });
}

/** Remove one keyword from a tracked app's durable keyword set. */
export async function deleteKeywordForTrackedApp(
  db: Db,
  trackedAppId: string,
  country: string,
  keyword: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(trackedAppKeywords)
      .where(
        and(
          eq(trackedAppKeywords.trackedAppId, trackedAppId),
          eq(trackedAppKeywords.country, country.toUpperCase()),
          eq(trackedAppKeywords.keyword, keyword),
        ),
      );

    const rows = await tx
      .select({ id: trackedAppKeywords.id })
      .from(trackedAppKeywords)
      .where(eq(trackedAppKeywords.trackedAppId, trackedAppId));

    await tx
      .update(trackedApps)
      .set({ generatedKeywordCount: rows.length })
      .where(eq(trackedApps.id, trackedAppId));
  });
}

/** The metadata hash currently backing this tracked app's generated set. */
export async function getGeneratedKeywordInputHash(
  db: Db,
  trackedAppId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ inputHash: trackedAppKeywords.inputHash })
    .from(trackedAppKeywords)
    .where(eq(trackedAppKeywords.trackedAppId, trackedAppId))
    .limit(1);
  return row?.inputHash ?? null;
}

/** Delete generated keywords before removing the tracked-app row. */
export async function deleteGeneratedKeywordsForTrackedApp(
  db: Db,
  trackedAppId: string,
): Promise<void> {
  await db
    .delete(trackedAppKeywords)
    .where(eq(trackedAppKeywords.trackedAppId, trackedAppId));
}

/** Generated Keyword rows for one tracked app, in stable creation order. */
export async function listGeneratedKeywordsForTrackedApp(
  db: Db,
  trackedAppId: string,
): Promise<GeneratedTrackedAppKeyword[]> {
  const rows = await db
    .select()
    .from(trackedAppKeywords)
    .where(eq(trackedAppKeywords.trackedAppId, trackedAppId))
    .orderBy(trackedAppKeywords.createdAt);

  return rows.map((row) => ({
    id: row.id,
    trackedAppId: row.trackedAppId,
    appId: row.appId,
    store: row.store as Store,
    country: row.country,
    keyword: row.keyword,
    source: row.source,
    createdAt: row.createdAt,
  }));
}

export function filterGeneratedKeywordsForCountry(
  generated: GeneratedTrackedAppKeyword[],
  country: string,
): GeneratedTrackedAppKeyword[] {
  const market = country.toUpperCase();
  return generated.filter((row) => row.source === "ai" || row.country === market);
}

/** Append one observed Keyword ranking. Null rank means the app was not in the fetched result window. */
export async function insertKeywordRanking(
  db: Db,
  input: { keywordId: string; appId: string; rank: number | null; observedAt: Date },
): Promise<void> {
  await db.insert(keywordRankings).values({
    id: randomUUID(),
    keywordId: input.keywordId,
    appId: input.appId,
    rank: input.rank,
    observedAt: input.observedAt,
  });
}

export function latestRankObservations(
  rankingRows: Array<{ keywordId: string; rank: number | null; observedAt: Date }>,
): Map<string, { rank: number | null; observedAt: Date }> {
  const latestRankByKeywordId = new Map<string, { rank: number | null; observedAt: Date }>();
  for (const row of rankingRows) {
    if (!latestRankByKeywordId.has(row.keywordId)) {
      latestRankByKeywordId.set(row.keywordId, { rank: row.rank, observedAt: row.observedAt });
    }
  }
  return latestRankByKeywordId;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function positionDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return previous - current;
}

function dailyRankObservations(
  rankingRows: Array<{ rank: number | null; observedAt: Date }>,
): Array<{ rank: number | null; observedAt: Date }> {
  const latestByDay = new Map<string, { rank: number | null; observedAt: Date }>();

  for (const row of rankingRows) {
    const key = dayKey(row.observedAt);
    const current = latestByDay.get(key);
    if (!current || row.observedAt > current.observedAt) {
      latestByDay.set(key, row);
    }
  }

  return [...latestByDay.values()].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
}

export function buildPositionHistorySeries(input: {
  generated: GeneratedTrackedAppKeyword[];
  rankingRows: Array<{ keywordId: string; rank: number | null; observedAt: Date }>;
  country?: string;
}): TrackedAppPositionSeries[] {
  const market = input.country?.toUpperCase();
  const byKeyword = new Map<string, Array<{ rank: number | null; observedAt: Date }>>();

  for (const row of input.rankingRows) {
    const rows = byKeyword.get(row.keywordId) ?? [];
    rows.push({ rank: row.rank, observedAt: row.observedAt });
    byKeyword.set(row.keywordId, rows);
  }

  return input.generated.map((row) => {
    const rowCountry = market ?? row.country;
    const keywordId = makeKeywordLookupId(row.store, rowCountry, row.keyword);
    const rows = dailyRankObservations(byKeyword.get(keywordId) ?? []);
    let previousRank: number | null | undefined;

    return {
      keywordId,
      keyword: row.keyword,
      country: rowCountry,
      store: row.store,
      points: rows.map((rankRow) => {
        const delta = previousRank === undefined ? null : positionDelta(rankRow.rank, previousRank);
        previousRank = rankRow.rank;
        return {
          date: dayKey(rankRow.observedAt),
          position: rankRow.rank,
          delta,
        };
      }),
    };
  });
}

export async function markTrackedAppAnalyzed(
  db: Db,
  trackedAppId: string,
  analyzedAt = new Date(),
): Promise<void> {
  await db
    .update(trackedApps)
    .set({ lastAnalyzedAt: analyzedAt })
    .where(eq(trackedApps.id, trackedAppId));
}

/** Generated keywords plus cached metrics and newest persisted position. */
export async function listTrackedAppKeywordRankings(
  db: Db,
  trackedAppId: string,
  country?: string,
): Promise<TrackedAppKeywordRankingEntry[]> {
  const generated = await listGeneratedKeywordsForTrackedApp(db, trackedAppId);
  if (generated.length === 0) return [];

  const market = country?.toUpperCase();
  const visible = market ? filterGeneratedKeywordsForCountry(generated, market) : generated;
  const keywordIds = keywordIdsForGeneratedKeywords(visible, market);
  const keywordRows = await db
    .select()
    .from(keywords)
    .where(inArray(keywords.id, keywordIds));
  const keywordById = new Map(keywordRows.map((row) => [row.id, row as KeywordRow]));

  const rankingRows = await db
    .select()
    .from(keywordRankings)
    .where(
      and(
        eq(keywordRankings.appId, generated[0]!.appId),
        inArray(keywordRankings.keywordId, keywordIds),
      ),
    )
    .orderBy(desc(keywordRankings.observedAt));
  const latestRankByKeywordId = latestRankObservations(rankingRows);
  const historyByKeywordId = new Map(
    buildPositionHistorySeries({ generated: visible, rankingRows, country: market })
      .map((row) => [row.keywordId, row]),
  );

  return visible.map((row) => {
    const rowCountry = market ?? row.country;
    const keywordId = makeKeywordLookupId(row.store, rowCountry, row.keyword);
    const metrics = keywordById.has(keywordId) ? keywordRowToDifficulty(keywordById.get(keywordId)!) : null;
    const latest = latestRankByKeywordId.get(keywordId);
    const latestPoint = historyByKeywordId.get(keywordId)?.points.at(-1);
    return {
      keywordId,
      keyword: row.keyword,
      country: rowCountry,
      store: row.store,
      position: latest?.rank ?? null,
      growth: latestPoint?.delta ?? null,
      observedAt: latest?.observedAt ?? null,
      popularity: metrics?.popularity ?? null,
      difficulty: metrics?.difficulty ?? null,
      trafficScore: metrics?.trafficScore ?? null,
      opportunityScore: metrics?.opportunityScore ?? null,
      competingAppCount: metrics?.competingAppCount ?? null,
      topApps: metrics?.topApps ?? [],
    };
  });
}

/** Full append-only position history for a tracked app in one market. */
export async function listTrackedAppPositionHistory(
  db: Db,
  trackedAppId: string,
  country?: string,
): Promise<TrackedAppPositionSeries[]> {
  const generated = await listGeneratedKeywordsForTrackedApp(db, trackedAppId);
  if (generated.length === 0) return [];

  const market = country?.toUpperCase();
  const visible = market ? filterGeneratedKeywordsForCountry(generated, market) : generated;
  const keywordIds = keywordIdsForGeneratedKeywords(visible, market);
  const rankingRows = await db
    .select({
      keywordId: keywordRankings.keywordId,
      rank: keywordRankings.rank,
      observedAt: keywordRankings.observedAt,
    })
    .from(keywordRankings)
    .where(
      and(
        eq(keywordRankings.appId, generated[0]!.appId),
        inArray(keywordRankings.keywordId, keywordIds),
      ),
    )
    .orderBy(asc(keywordRankings.observedAt));

  return buildPositionHistorySeries({ generated: visible, rankingRows, country: market });
}

/** Remove an app from the tracked list. */
export async function untrackApp(
  db: Db,
  appId: string,
  store: Store,
  country: string,
): Promise<void> {
  const tracked = await getTrackedApp(db, appId, store, country);
  if (tracked) await deleteGeneratedKeywordsForTrackedApp(db, tracked.id);

  await db
    .delete(trackedApps)
    .where(
      and(
        eq(trackedApps.appId, appId),
        eq(trackedApps.store, store),
        eq(trackedApps.country, country),
      ),
    );
}

/** The full tracked-apps list with current store metadata, newest first. */
export async function listTrackedApps(db: Db): Promise<TrackedAppEntry[]> {
  const rows = await db
    .select({ t: trackedApps, a: apps })
    .from(trackedApps)
    .innerJoin(apps, eq(trackedApps.appId, apps.id))
    .orderBy(desc(trackedApps.addedAt));

  return rows.map(({ t, a }) => ({
    id: t.id,
    appId: t.appId,
    storeAppId: a.storeAppId,
    store: t.store as Store,
    country: t.country,
    title: a.title,
    developer: a.developer,
    iconUrl: a.iconUrl,
    category: a.category,
    addedAt: t.addedAt,
    generatedKeywordCount: t.generatedKeywordCount,
    lastAnalyzedAt: t.lastAnalyzedAt,
  }));
}

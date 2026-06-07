import { eq, and } from "drizzle-orm";
import { computeOpportunityScore } from "@kittie/intelligence";
import type { KeywordDifficulty, Store } from "@kittie/types";

import type { Db } from "../client.js";
import { keywords } from "../schema.js";

export interface KeywordRow {
  id: string;
  keyword: string;
  country: string;
  store: Store;
  popularity: number | null;
  difficulty: number | null;
  trafficScore: number | null;
  competingAppCount: number | null;
  topResults: string | null;
  computedAt: Date;
}

export function makeKeywordLookupId(store: Store, country: string, keyword: string): string {
  return `${store}:${country.toUpperCase()}:${keyword.trim().toLowerCase()}`;
}

export async function findKeyword(
  db: Db,
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordRow | null> {
  const id = makeKeywordLookupId(store, country, keyword);
  const rows = await db.select().from(keywords).where(eq(keywords.id, id)).limit(1);
  return rows[0] ?? null;
}

export function keywordRowToDifficulty(row: KeywordRow): KeywordDifficulty | null {
  if (
    row.popularity == null ||
    row.difficulty == null ||
    row.trafficScore == null ||
    row.competingAppCount == null ||
    !row.topResults
  ) {
    return null;
  }

  let topApps: KeywordDifficulty["topApps"];
  try {
    topApps = JSON.parse(row.topResults) as KeywordDifficulty["topApps"];
  } catch {
    return null;
  }

  return {
    keyword: row.keyword,
    country: row.country,
    store: row.store,
    popularity: row.popularity,
    difficulty: row.difficulty,
    trafficScore: row.trafficScore,
    opportunityScore: computeOpportunityScore(row.popularity, row.difficulty),
    competingAppCount: row.competingAppCount,
    topApps,
  };
}

export async function upsertKeywordRow(
  db: Db,
  input: {
    id: string;
    keyword: string;
    country: string;
    store: Store;
    popularity: number;
    difficulty: number;
    trafficScore: number;
    competingAppCount: number;
    topResults: KeywordDifficulty["topApps"];
    computedAt: Date;
  },
): Promise<void> {
  await db
    .insert(keywords)
    .values({
      id: input.id,
      keyword: input.keyword,
      country: input.country.toUpperCase(),
      store: input.store,
      popularity: input.popularity,
      difficulty: input.difficulty,
      trafficScore: input.trafficScore,
      competingAppCount: input.competingAppCount,
      topResults: JSON.stringify(input.topResults),
      computedAt: input.computedAt,
    })
    .onConflictDoUpdate({
      target: keywords.id,
      set: {
        popularity: input.popularity,
        difficulty: input.difficulty,
        trafficScore: input.trafficScore,
        competingAppCount: input.competingAppCount,
        topResults: JSON.stringify(input.topResults),
        computedAt: input.computedAt,
      },
    });
}

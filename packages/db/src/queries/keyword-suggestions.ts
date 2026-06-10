import { eq, sql } from "drizzle-orm";
import type { Store } from "@kittie/types";

import type { Db } from "../client.js";
import { apps } from "../schema.js";

export interface KeywordSuggestion {
  keyword: string;
  source: "category" | "title_pattern";
  appCount: number;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "app",
  "apps",
  "your",
  "free",
  "pro",
  "plus",
  "lite",
  "ios",
  "android",
]);

function normalizeCategory(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function titleBigrams(title: string): string[] {
  const tokens = titleTokens(title);
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

/** Chip-friendly seeds from tracked apps — categories + recurring title phrases. */
export async function listKeywordSuggestions(
  db: Db,
  options: { store?: Store; limit?: number } = {},
): Promise<KeywordSuggestion[]> {
  const limit = options.limit ?? 20;

  let query = db
    .select({ title: apps.title, category: apps.category })
    .from(apps);

  if (options.store) {
    query = query.where(eq(apps.store, options.store)) as typeof query;
  }

  const rows = await query;

  const categoryCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.category) {
      const key = normalizeCategory(row.category);
      if (key.length >= 3) {
        categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
      }
    }

    for (const bigram of titleBigrams(row.title)) {
      bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
    }
  }

  const suggestions: KeywordSuggestion[] = [];

  for (const [keyword, appCount] of categoryCounts) {
    suggestions.push({ keyword, source: "category", appCount });
  }

  for (const [keyword, appCount] of bigramCounts) {
    if (appCount < 2) continue;
    suggestions.push({ keyword, source: "title_pattern", appCount });
  }

  suggestions.sort((a, b) => b.appCount - a.appCount || a.keyword.localeCompare(b.keyword));

  const seen = new Set<string>();
  const unique: KeywordSuggestion[] = [];
  for (const item of suggestions) {
    if (seen.has(item.keyword)) continue;
    seen.add(item.keyword);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

/** Count of tracked apps backing suggestions (for meta). */
export async function countAppsForSuggestions(db: Db, store?: Store): Promise<number> {
  if (store) {
    const row = await db
      .select({ count: sql<number>`count(*)` })
      .from(apps)
      .where(eq(apps.store, store));
    return row[0]?.count ?? 0;
  }
  const row = await db.select({ count: sql<number>`count(*)` }).from(apps);
  return row[0]?.count ?? 0;
}

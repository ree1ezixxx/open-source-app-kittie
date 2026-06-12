import { computeKeywordDifficulty } from "@kittie/intelligence";
import { getTopRankedApps } from "@kittie/db";
import type { KeywordDifficulty, Store } from "@kittie/types";
import { MOCK_APPS } from "../mock/fixtures.js";
import { getDb } from "../lib/db.js";

const KEYWORD_FIXTURES: Record<string, KeywordDifficulty> = {
  "focus timer": buildKeywordFixture("focus timer", "US", "apple"),
  "budget app": buildKeywordFixture("budget app", "US", "apple"),
  "photo editor": buildKeywordFixture("photo editor", "US", "google"),
};

function buildKeywordFixture(keyword: string, country: string, store: Store): KeywordDifficulty {
  const ranked = MOCK_APPS.filter((a) => a.store === store)
    .sort((a, b) => (a.signals.chartRank ?? 999) - (b.signals.chartRank ?? 999))
    .slice(0, 10)
    .map((a, i) => ({
      title: a.title,
      iconUrl: a.iconUrl,
      reviewCount: a.reviewCount,
      rating: a.rating,
      rank: i + 1,
    }));

  return computeKeywordDifficulty({ keyword, country, store, topRankedApps: ranked });
}

async function getRankedAppsForKeyword(store: Store, limit = 10) {
  try {
    // Query real data if database is available
    const ranked = await getTopRankedApps(getDb(), store, limit);
    return ranked;
  } catch {
    // Fall back to mock data if database unavailable
    return MOCK_APPS.filter((a) => a.store === store)
      .sort((a, b) => (a.signals.chartRank ?? 999) - (b.signals.chartRank ?? 999))
      .slice(0, limit)
      .map((a, i) => ({
        title: a.title,
        iconUrl: a.iconUrl,
        reviewCount: a.reviewCount,
        rating: a.rating,
        rank: i + 1,
      }));
  }
}

export async function getKeywordDifficulty(
  keyword: string,
  country: string,
  store: Store,
): Promise<KeywordDifficulty> {
  const key = keyword.toLowerCase();
  const cached = KEYWORD_FIXTURES[key];
  if (cached && cached.country === country && cached.store === store) return cached;

  const topRanked = await getRankedAppsForKeyword(store, 10);
  return computeKeywordDifficulty({
    keyword,
    country,
    store,
    topRankedApps: topRanked,
  });
}

export async function batchKeywordDifficulty(
  items: Array<{ keyword: string; country: string; store: Store }>,
): Promise<KeywordDifficulty[]> {
  return Promise.all(
    items.slice(0, 10).map((item) => getKeywordDifficulty(item.keyword, item.country, item.store)),
  );
}

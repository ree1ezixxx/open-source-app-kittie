import { computeKeywordDifficulty } from "@kittie/intelligence";
import type { KeywordDifficulty, Store } from "@kittie/types";
import { MOCK_APPS } from "../mock/fixtures.js";

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

export function getKeywordDifficulty(
  keyword: string,
  country: string,
  store: Store,
): KeywordDifficulty {
  const key = keyword.toLowerCase();
  const cached = KEYWORD_FIXTURES[key];
  if (cached && cached.country === country && cached.store === store) return cached;

  return computeKeywordDifficulty({
    keyword,
    country,
    store,
    topRankedApps: MOCK_APPS.filter((a) => a.store === store)
      .slice(0, 5)
      .map((a, i) => ({
        title: a.title,
        iconUrl: a.iconUrl,
        reviewCount: a.reviewCount,
        rating: a.rating,
        rank: i + 1,
      })),
  });
}

export function batchKeywordDifficulty(
  items: Array<{ keyword: string; country: string; store: Store }>,
): KeywordDifficulty[] {
  return items.slice(0, 10).map((item) => getKeywordDifficulty(item.keyword, item.country, item.store));
}

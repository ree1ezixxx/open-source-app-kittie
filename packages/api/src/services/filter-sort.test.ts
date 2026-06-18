import { describe, expect, it } from "vitest";
import type { AppListItem } from "@kittie/types";
import { matchesSearch, type ScoredAppRow } from "./filter-sort.js";

function row(
  item: Partial<AppListItem> & Pick<AppListItem, "title" | "developer">,
  meta?: Partial<ScoredAppRow["meta"]>,
): ScoredAppRow {
  return {
    item: {
      id: "test",
      store: "apple",
      storeAppId: "1",
      iconUrl: null,
      category: null,
      rating: null,
      reviewCount: 0,
      reviewGrowth7d: null,
      downloadsEstimate30d: null,
      revenueEstimate30d: null,
      growthScore: null,
      growthPct: null,
      downloadsEstimatePrior: null,
      revenueEstimatePrior: null,
      rankDelta: null,
      isFirstMover: false,
      releasedAt: null,
      updatedAt: null,
      ...item,
    },
    meta: {
      hasMetaAds: false,
      hasAppleAds: false,
      hasCreators: false,
      hasEmail: false,
      hasWebsite: false,
      price: null,
      languages: [],
      description: null,
      ...meta,
    },
  };
}

describe("matchesSearch text scope", () => {
  const sample = row(
    { title: "Photo Editor Pro", developer: "Pixel Labs" },
    { description: "Edit photos with AI filters" },
  );

  it("matches title only when scoped to title", () => {
    expect(matchesSearch(sample, { search: "photo", textSearchFields: "title" })).toBe(true);
    expect(matchesSearch(sample, { search: "pixel", textSearchFields: "title" })).toBe(false);
  });

  it("matches developer only when scoped to developer", () => {
    expect(matchesSearch(sample, { search: "pixel", textSearchFields: "developer" })).toBe(true);
    expect(matchesSearch(sample, { search: "photo", textSearchFields: "developer" })).toBe(false);
  });

  it("matches description only when scoped to description", () => {
    expect(matchesSearch(sample, { search: "ai filters", textSearchFields: "description" })).toBe(true);
    expect(matchesSearch(sample, { search: "pixel", textSearchFields: "description" })).toBe(false);
  });

  it("searches all fields when textSearchFields is omitted", () => {
    expect(matchesSearch(sample, { search: "pixel" })).toBe(true);
    expect(matchesSearch(sample, { search: "ai filters" })).toBe(true);
  });
});

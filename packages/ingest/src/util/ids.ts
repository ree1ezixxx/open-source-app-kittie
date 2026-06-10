import type { Store } from "@kittie/types";

export function makeAppId(store: Store, storeAppId: string): string {
  return `${store}:${storeAppId}`;
}

export function makeSnapshotId(appId: string, snapshotDate: string): string {
  return `${appId}:${snapshotDate}`;
}

export function makeKeywordId(store: Store, country: string, keyword: string): string {
  return `${store}:${country.toUpperCase()}:${keyword.trim().toLowerCase()}`;
}

export function makeKeywordRankingId(keywordId: string, rank: number): string {
  return `${keywordId}:${rank}`;
}

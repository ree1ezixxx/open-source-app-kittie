import type { Store } from "@kittie/types";

export function makeAppId(store: Store, storeAppId: string): string {
  return `${store}:${storeAppId}`;
}

export function makeSnapshotId(appId: string, snapshotDate: string, country = "US"): string {
  // US keeps the bare `appId:date` id for backward-compat with the existing rows
  // (no id rewrite on migration); other markets suffix the country so the
  // per-(app, date, country) rows stay distinct under the new unique key (ADR 0007).
  const cc = country.toUpperCase();
  return cc === "US" ? `${appId}:${snapshotDate}` : `${appId}:${snapshotDate}:${cc}`;
}

export function makeKeywordId(store: Store, country: string, keyword: string): string {
  return `${store}:${country.toUpperCase()}:${keyword.trim().toLowerCase()}`;
}

export function makeKeywordRankingId(keywordId: string, rank: number): string {
  return `${keywordId}:${rank}`;
}

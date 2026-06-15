import type { Store } from "@kittie/types";

export function makeAppId(store: Store, storeAppId: string): string {
  return `${store}:${storeAppId}`;
}

export function makeSnapshotId(appId: string, snapshotDate: string): string {
  return `${appId}:${snapshotDate}`;
}

/** Stable id for one organic video: app + per-app ordinal. Stable across runs
 *  so re-ingest upserts the same rows rather than duplicating. */
export function makeOrganicVideoId(appId: string, ordinal: number): string {
  return `${appId}:org:${ordinal}`;
}

export function makeKeywordId(store: Store, country: string, keyword: string): string {
  return `${store}:${country.toUpperCase()}:${keyword.trim().toLowerCase()}`;
}

export function makeKeywordRankingId(keywordId: string, rank: number): string {
  return `${keywordId}:${rank}`;
}

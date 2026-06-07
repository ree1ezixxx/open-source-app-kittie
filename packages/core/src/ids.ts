import type { Store } from "@kittie/types";

export function makeAppId(store: Store, storeAppId: string): string {
  return `${store}:${storeAppId}`;
}

export function makeSnapshotId(appId: string, snapshotDate: string): string {
  return `${appId}:${snapshotDate}`;
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

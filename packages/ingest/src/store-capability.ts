import type { DistributionStore, Store } from "@kittie/types";

import { lookupAppleApp } from "./apple/lookup.js";
import { fetchGoogleAppMetadata } from "./google/metadata.js";

export interface LiveStoreListing {
  storeAppId: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  price: number | null;
  contentRating: string | null;
  screenshotUrls: string[];
  releasedAt: Date | null;
  updatedAt: Date | null;
  reviewCount: number;
  rating: number | null;
}

export interface DistributionStoreCapability {
  distributionStore: DistributionStore;
  isMobileStore: boolean;
  liveListing: boolean;
  snapshotRefresh: boolean;
  reviews: boolean;
  keywords: boolean;
  politeDelayMs: number;
}

const CAPABILITIES = {
  apple: {
    distributionStore: "apple",
    isMobileStore: true,
    liveListing: true,
    snapshotRefresh: true,
    reviews: true,
    keywords: true,
    politeDelayMs: 0,
  },
  google: {
    distributionStore: "google",
    isMobileStore: true,
    liveListing: true,
    snapshotRefresh: true,
    reviews: true,
    keywords: true,
    politeDelayMs: 150,
  },
  steam: {
    distributionStore: "steam",
    isMobileStore: false,
    liveListing: false,
    snapshotRefresh: false,
    reviews: false,
    keywords: false,
    politeDelayMs: 0,
  },
  itch: {
    distributionStore: "itch",
    isMobileStore: false,
    liveListing: false,
    snapshotRefresh: false,
    reviews: false,
    keywords: false,
    politeDelayMs: 0,
  },
} satisfies Record<DistributionStore, DistributionStoreCapability>;

export function distributionStoreCapability(store: string): DistributionStoreCapability | null {
  return isDistributionStore(store) ? CAPABILITIES[store] : null;
}

export function isDistributionStore(store: string): store is DistributionStore {
  return store === "apple" || store === "google" || store === "steam" || store === "itch";
}

export function isMobileStore(store: string): store is Store {
  return store === "apple" || store === "google";
}

export function supportsLiveListing(store: string): store is Store {
  return distributionStoreCapability(store)?.liveListing === true && isMobileStore(store);
}

export function supportsSnapshotRefresh(store: string): store is Store {
  return distributionStoreCapability(store)?.snapshotRefresh === true && isMobileStore(store);
}

export async function fetchLiveStoreListing(
  store: string,
  storeAppId: string,
): Promise<LiveStoreListing | null> {
  if (store === "apple") return lookupAppleApp(storeAppId);
  if (store === "google") return fetchGoogleAppMetadata(storeAppId);
  return null;
}

import { describe, expect, it } from "vitest";

import {
  distributionStoreCapability,
  fetchLiveStoreListing,
  isMobileStore,
  supportsLiveListing,
  supportsSnapshotRefresh,
} from "./store-capability.js";

describe("distributionStoreCapability", () => {
  it("marks Apple and Google as mobile Stores with live data support", () => {
    expect(distributionStoreCapability("apple")).toMatchObject({
      isMobileStore: true,
      liveListing: true,
      snapshotRefresh: true,
      reviews: true,
      keywords: true,
    });
    expect(distributionStoreCapability("google")).toMatchObject({
      isMobileStore: true,
      liveListing: true,
      snapshotRefresh: true,
      reviews: true,
      keywords: true,
      politeDelayMs: 150,
    });
    expect(isMobileStore("apple")).toBe(true);
    expect(supportsLiveListing("google")).toBe(true);
    expect(supportsSnapshotRefresh("apple")).toBe(true);
  });

  it("keeps Steam and itch explicit but unsupported for mobile-only refreshes", async () => {
    expect(distributionStoreCapability("steam")).toMatchObject({
      isMobileStore: false,
      liveListing: false,
      snapshotRefresh: false,
      reviews: false,
      keywords: false,
    });
    expect(distributionStoreCapability("itch")?.snapshotRefresh).toBe(false);
    expect(isMobileStore("steam")).toBe(false);
    expect(supportsLiveListing("itch")).toBe(false);
    expect(supportsSnapshotRefresh("steam")).toBe(false);
    await expect(fetchLiveStoreListing("steam", "123")).resolves.toBeNull();
  });

  it("rejects unknown distribution stores", () => {
    expect(distributionStoreCapability("windows")).toBeNull();
    expect(isMobileStore("windows")).toBe(false);
    expect(supportsLiveListing("windows")).toBe(false);
    expect(supportsSnapshotRefresh("windows")).toBe(false);
  });
});

import type { CanonicalAppRecord } from "@kittie/db";
import type {
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  MetaAdCreative,
  Store,
} from "@kittie/types";
import { makeAppId } from "@kittie/core";

import type { AppleLookupResult } from "../apple/lookup.js";
import { type AdapterContext, type SourceAdapter, fieldMaker, isoOrNull } from "./shared.js";

const APPLE_SOURCE = "apple:lookup";

/** Map an Apple iTunes lookup result into the canonical record. */
export function appleToCanonical(raw: AppleLookupResult, ctx: AdapterContext): CanonicalAppRecord {
  const f = fieldMaker(ctx, APPLE_SOURCE, "lookup");
  return {
    appId: f.req(makeAppId("apple", raw.storeAppId)),
    store: f.req<Store>("apple"),
    storeAppId: f.req(raw.storeAppId),
    bundleId: f.opt(raw.bundleId),

    title: f.req(raw.title),
    developer: f.req(raw.developer),
    category: f.opt(raw.category),
    iconUrl: f.opt(raw.iconUrl),
    description: f.opt(raw.description),
    websiteUrl: f.opt(raw.websiteUrl),
    // Apple's lookup payload doesn't carry a support email.
    supportEmail: f.opt<string>(null),
    price: f.opt(raw.price),
    contentRating: f.opt(raw.contentRating),
    languages: f.arr(raw.languages),
    screenshotUrls: f.arr(raw.screenshotUrls),
    releasedAt: f.opt(isoOrNull(raw.releasedAt)),
    updatedAt: f.opt(isoOrNull(raw.updatedAt)),
    fileSizeBytes: f.opt(raw.fileSizeBytes),
    minOsVersion: f.opt(raw.minOsVersion),
    sellerName: f.opt(raw.sellerName),

    reviewCount: f.req(raw.reviewCount),
    rating: f.opt(raw.rating),

    metaAds: f.notRun<MetaAdCreative[]>(),
    creators: f.notRun<CreatorPartnership[]>(),
    iaps: f.notRun<AppIap[]>(),
    appleSearchAds: f.notRun<AppleSearchAd[]>(),
  };
}

export const appleAdapter: SourceAdapter<AppleLookupResult> = {
  source: APPLE_SOURCE,
  toCanonical: appleToCanonical,
};

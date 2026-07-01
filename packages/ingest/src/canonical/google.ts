import type { CanonicalAppRecord } from "@kittie/db";
import type {
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  MetaAdCreative,
  Store,
} from "@kittie/types";
import { makeAppId } from "@kittie/core";

import type { GoogleAppMetadata } from "../google/metadata.js";
import { type AdapterContext, type SourceAdapter, fieldMaker, isoOrNull } from "./shared.js";

const GOOGLE_SOURCE = "google:scrape";

/** Map a Google Play metadata result into the canonical record. */
export function googleToCanonical(raw: GoogleAppMetadata, ctx: AdapterContext): CanonicalAppRecord {
  const f = fieldMaker(ctx, GOOGLE_SOURCE, "scrape");
  return {
    appId: f.req(makeAppId("google", raw.storeAppId)),
    store: f.req<Store>("google"),
    storeAppId: f.req(raw.storeAppId),
    bundleId: f.opt(raw.bundleId),

    title: f.req(raw.title),
    developer: f.req(raw.developer),
    category: f.opt(raw.category),
    iconUrl: f.opt(raw.iconUrl),
    description: f.opt(raw.description),
    websiteUrl: f.opt(raw.websiteUrl),
    supportEmail: f.opt<string>(null),
    price: f.opt(raw.price),
    contentRating: f.opt(raw.contentRating),
    // This Google source shape omits these listing facts — recorded as such,
    // not asserted absent.
    languages: f.arr<string>(null),
    screenshotUrls: f.arr(raw.screenshotUrls),
    releasedAt: f.opt(isoOrNull(raw.releasedAt)),
    updatedAt: f.opt(isoOrNull(raw.updatedAt)),
    fileSizeBytes: f.opt<number>(null),
    minOsVersion: f.opt<string>(null),
    sellerName: f.opt<string>(null),

    reviewCount: f.req(raw.reviewCount),
    rating: f.opt(raw.rating),

    metaAds: f.notRun<MetaAdCreative[]>(),
    creators: f.notRun<CreatorPartnership[]>(),
    iaps: f.notRun<AppIap[]>(),
    appleSearchAds: f.notRun<AppleSearchAd[]>(),
  };
}

export const googleAdapter: SourceAdapter<GoogleAppMetadata> = {
  source: GOOGLE_SOURCE,
  toCanonical: googleToCanonical,
};

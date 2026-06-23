import type {
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  MetaAdCreative,
  Provenanced,
  Store,
} from "@kittie/types";

/**
 * The Kittie-owned canonical app record — what every source adapter produces and
 * the rest of the platform reasons over. Decouples us from any single provider's
 * shape (e.g. appkittie.com): a source maps *into* this, never the other way.
 *
 * Every field is wrapped in `Provenanced<T>` (lane L0) so each value carries its
 * source, freshness and coverage — and an absent field is an explicit
 * `missing()` with a reason, never a bare null/`[]` that reads as a market fact.
 * The builders live in `@kittie/ingest`; this is the shared shape. (Lane L1, epic #97.)
 */
export interface CanonicalAppRecord {
  // Identity
  appId: Provenanced<string>;
  store: Provenanced<Store>;
  storeAppId: Provenanced<string>;
  bundleId: Provenanced<string>;

  // Listing facts
  title: Provenanced<string>;
  developer: Provenanced<string>;
  category: Provenanced<string>;
  iconUrl: Provenanced<string>;
  description: Provenanced<string>;
  websiteUrl: Provenanced<string>;
  supportEmail: Provenanced<string>;
  price: Provenanced<number>;
  contentRating: Provenanced<string>;
  languages: Provenanced<string[]>;
  screenshotUrls: Provenanced<string[]>;
  /** ISO-8601. */
  releasedAt: Provenanced<string>;
  /** ISO-8601. */
  updatedAt: Provenanced<string>;
  fileSizeBytes: Provenanced<number>;
  minOsVersion: Provenanced<string>;
  sellerName: Provenanced<string>;

  // Point-in-time metrics
  reviewCount: Provenanced<number>;
  rating: Provenanced<number>;

  // Related collections — absent from a listing source until their own ingest
  // path runs; surfaced as `missing("not_attempted")`, never fabricated.
  metaAds: Provenanced<MetaAdCreative[]>;
  creators: Provenanced<CreatorPartnership[]>;
  iaps: Provenanced<AppIap[]>;
  appleSearchAds: Provenanced<AppleSearchAd[]>;
}

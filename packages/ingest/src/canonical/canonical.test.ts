import { describe, expect, it } from "vitest";

import type { AppleLookupResult } from "../apple/lookup.js";
import type { GoogleAppMetadata } from "../google/metadata.js";
import { appleToCanonical } from "./apple.js";
import { googleToCanonical } from "./google.js";
import { recordCoverageView } from "./coverage.js";
import type { AdapterContext } from "./shared.js";

const NOW = Date.parse("2026-06-23T00:00:00Z");
const DAY = 86_400_000;
const FRESH_CTX: AdapterContext = { observedAt: "2026-06-23T00:00:00Z", country: "US", now: NOW, maxAgeMs: DAY };

const appleRaw: AppleLookupResult = {
  storeAppId: "389801252",
  artistId: "389801255",
  bundleId: "com.burbn.instagram",
  title: "Instagram",
  developer: "Instagram, Inc.",
  category: "Photo & Video",
  iconUrl: "https://is1.example/icon.png",
  description: "Bringing you closer to the people and things you love.",
  websiteUrl: "https://instagram.com",
  price: 0,
  contentRating: "12+",
  languages: ["EN", "ES"],
  screenshotUrls: ["https://is1.example/1.png", "https://is1.example/2.png"],
  releasedAt: new Date("2010-10-06T00:00:00Z"),
  updatedAt: new Date("2026-06-20T00:00:00Z"),
  reviewCount: 28_000_000,
  rating: 4.7,
  fileSizeBytes: 123_456_789,
  minOsVersion: "15.0",
  sellerName: "Instagram, Inc.",
};

const googleRaw: GoogleAppMetadata = {
  storeAppId: "com.instagram.android",
  bundleId: "com.instagram.android",
  title: "Instagram",
  developer: "Instagram",
  category: "Social",
  iconUrl: "https://play.example/icon.png",
  description: "Little moments lead to big friendships.",
  websiteUrl: "https://instagram.com",
  contentRating: "Teen",
  screenshotUrls: ["https://play.example/1.png"],
  releasedAt: new Date("2012-04-03T00:00:00Z"),
  updatedAt: new Date("2026-06-21T00:00:00Z"),
  reviewCount: 150_000_000,
  rating: 4.3,
  price: 0,
};

/** A value is Provenanced iff it carries the wrapper's discriminating fields. */
function isProvenanced(x: unknown): boolean {
  return (
    typeof x === "object" &&
    x !== null &&
    "kind" in x &&
    "coverage" in x &&
    "value" in x &&
    "freshness" in x
  );
}

describe("appleToCanonical", () => {
  const rec = appleToCanonical(appleRaw, FRESH_CTX);

  it("wraps EVERY field in Provenanced<T>", () => {
    const values = Object.values(rec);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(isProvenanced)).toBe(true);
  });

  it("records present listing facts as observed, ok coverage", () => {
    expect(rec.title.value).toBe("Instagram");
    expect(rec.title.kind).toBe("observed");
    expect(rec.title.coverage).toBe("ok");
    expect(rec.store.value).toBe("apple");
    expect(rec.languages.value).toEqual(["EN", "ES"]);
    expect(rec.releasedAt.value).toBe("2010-10-06T00:00:00.000Z");
  });

  it("marks a field the source omits as missing with a reason, never a bare value", () => {
    expect(rec.supportEmail.value).toBeNull();
    expect(rec.supportEmail.kind).toBe("missing");
    expect(rec.supportEmail.coverage).toBe("source_omitted");
  });

  it("marks un-fetched collections as not_attempted, never fabricated", () => {
    for (const c of [rec.metaAds, rec.creators, rec.iaps, rec.appleSearchAds]) {
      expect(c.value).toBeNull();
      expect(c.kind).toBe("missing");
      expect(c.coverage).toBe("not_attempted");
    }
  });
});

describe("googleToCanonical", () => {
  const rec = googleToCanonical(googleRaw, FRESH_CTX);

  it("wraps EVERY field in Provenanced<T>", () => {
    expect(Object.values(rec).every(isProvenanced)).toBe(true);
  });

  it("records the fields this source carries", () => {
    expect(rec.store.value).toBe("google");
    expect(rec.price.value).toBe(0);
    expect(rec.price.kind).toBe("observed");
    expect(rec.screenshotUrls.value).toEqual(["https://play.example/1.png"]);
  });

  it("records source-omitted listing facts as missing, not absent", () => {
    for (const field of [rec.languages, rec.fileSizeBytes, rec.minOsVersion, rec.sellerName]) {
      expect(field.value).toBeNull();
      expect(field.kind).toBe("missing");
      expect(field.coverage).toBe("source_omitted");
    }
    // Meta ads etc. are "not_attempted", distinct from source_omitted.
    expect(rec.metaAds.coverage).toBe("not_attempted");
  });
});

describe("recordCoverageView", () => {
  it("reports a fresh, ok view for a just-fetched record", () => {
    const view = recordCoverageView(appleToCanonical(appleRaw, FRESH_CTX));
    expect(view.freshness).toBe("fresh");
    expect(view.overall).toBe("ok");
    expect(view.missing).toEqual(expect.arrayContaining(["supportEmail", "metaAds"]));
    expect(view.fields.title).toBe("ok");
  });

  it("reports stale once the fetched data ages past its window", () => {
    const agedCtx: AdapterContext = {
      observedAt: "2026-05-23T00:00:00Z", // 31 days before NOW
      now: NOW,
      maxAgeMs: DAY,
    };
    const view = recordCoverageView(appleToCanonical(appleRaw, agedCtx));
    expect(view.freshness).toBe("stale");
    expect(view.overall).toBe("stale");
  });
});

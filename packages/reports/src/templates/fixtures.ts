/**
 * Stable intelligence-response fixtures for the product report templates.
 * Deterministic (no clock reads) so golden/snapshot tests stay stable.
 */
import type { AppDetailIntelligenceResponse } from "@kittie/types";
import type { TrendsIntelligenceResponse } from "./category-pulse.js";

const generatedAt = "2026-07-01T12:00:00.000Z";

export const appDetailFixture: AppDetailIntelligenceResponse = {
  responseType: "app_detail",
  status: "ok",
  data: {
    app: {
      id: "app_focus",
      store: "apple",
      storeAppId: "6446901002",
      title: "Focus Timer",
      developer: "Deep Work Labs",
      category: "Productivity",
      iconUrl: "https://example.com/icon.png",
      releasedAt: "2024-01-10T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
    },
    observed: {
      rating: 4.8,
      reviewCount: 18420,
      chartRank: 12,
      listingMediaCount: 8,
      hasDescription: true,
      hasWebsite: true,
    },
    estimated: {
      downloads30d: 41000,
      revenue30dUsd: 76000,
      growthScore: 78,
      growthPct: 22,
      isFirstMover: true,
    },
    relationships: {
      inAppPurchaseCount: 3,
      metaAdCount: 0,
      appleSearchAdCount: 0,
      creatorCount: 4,
      reviewSampleCount: 200,
    },
  },
  evidence: [
    {
      id: "ev_reviews",
      claim: "Focus Timer has 18,420 public App Store reviews in the US snapshot.",
      source: { type: "app_store", id: "apple:6446901002", url: null },
      valueKind: "observed",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: generatedAt,
      metric: { name: "review_count", value: 18420, unit: "reviews" },
    },
    {
      id: "ev_revenue",
      claim: "Revenue is directionally estimated from public signals, not reported by the Store.",
      source: { type: "model", id: "model:revenue@v3", url: null },
      valueKind: "modelled",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: null,
      metric: { name: "revenue_30d_usd", value: 76000, unit: "USD" },
    },
  ],
  confidence: {
    score: 0.78,
    label: "medium",
    reasons: ["fresh Store snapshot", "modelled estimates are directional"],
  },
  caveats: [
    {
      kind: "estimated_metric",
      sourceType: "model",
      message: "Downloads, revenue, and Growth score are Estimated metrics, not Store truth.",
    },
  ],
  metadata: {
    contractVersion: "2026-07-01",
    generatedAt,
    sourceQuery: { appId: "apple:6446901002", country: "US" },
    snapshotId: "snapshot_us_2026_07_01",
    chartCountry: "US",
    growthPeriod: "30d",
    modelVersion: "report-fixture-v1",
  },
};

/** A variant with no listing media and a stale snapshot, to exercise honesty caveats. */
export const appDetailNoMediaFixture: AppDetailIntelligenceResponse = {
  ...appDetailFixture,
  data: {
    ...appDetailFixture.data,
    observed: { ...appDetailFixture.data.observed, listingMediaCount: 0 },
  },
  evidence: appDetailFixture.evidence.map((e) =>
    e.id === "ev_reviews" ? { ...e, freshness: "stale" } : e,
  ),
};

export const trendsFixture: TrendsIntelligenceResponse = {
  responseType: "trends",
  status: "partial",
  data: {
    category: "Productivity",
    country: "US",
    growthPeriod: "7d",
    limit: 25,
    snapshotDate: "2026-07-01",
    apps: [
      {
        rank: 1,
        appId: "apple:6446901002",
        store: "apple",
        title: "Focus Timer",
        developer: "Deep Work Labs",
        category: "Productivity",
        rating: 4.8,
        reviewCount: 18420,
        movement: { reviewGrowth: 2400, reviewGrowthPct: 18, rankDelta: 4, growthScore: 78 },
        evidenceIds: ["ev_snapshot_growth"],
      },
      {
        rank: 2,
        appId: "apple:1122334455",
        store: "apple",
        title: "Deep Focus",
        developer: "Calm Co",
        category: "Productivity",
        rating: 4.6,
        reviewCount: 9200,
        movement: { reviewGrowth: 300, reviewGrowthPct: 4, rankDelta: -1, growthScore: 41 },
        evidenceIds: ["ev_snapshot_growth"],
      },
    ],
  },
  evidence: [
    {
      id: "ev_snapshot_growth",
      claim: "Growth score uses same-market snapshot deltas for the selected period.",
      source: { type: "snapshot", id: "snapshot_us_2026_07_01", url: null },
      valueKind: "modelled",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: generatedAt,
      metric: { name: "growth_score", value: 78, unit: "score_0_100" },
    },
  ],
  confidence: {
    score: 0.52,
    label: "low",
    reasons: ["fresh snapshots present", "Meta advertising source is missing"],
  },
  caveats: [
    {
      kind: "missing_source",
      sourceType: "meta_ads",
      message: "Meta ads were not ingested; confidence is lowered instead of treating ads as zero.",
    },
  ],
  metadata: {
    contractVersion: "2026-07-01",
    generatedAt,
    sourceQuery: { category: "Productivity", country: "US", period: "7d" },
    snapshotId: "snapshot_us_2026_07_01",
    chartCountry: "US",
    growthPeriod: "7d",
    modelVersion: "report-fixture-v1",
  },
};

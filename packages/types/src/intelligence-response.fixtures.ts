import {
  INTELLIGENCE_CONTRACT_VERSION,
  type IntelligenceReportContract,
  type IntelligenceResponseEnvelope,
} from "./intelligence-response.js";

const generatedAt = "2026-07-01T12:00:00Z";

export interface AppDetailContractExample {
  appId: string;
  title: string;
  observed: {
    rating: number;
    reviews: number;
    category: string;
  };
  estimated: {
    downloads30d: number;
    revenue30dUsd: number;
    growthScore: number;
  };
}

export const appDetailResponseExample = {
  responseType: "app_detail",
  status: "ok",
  data: {
    appId: "apple:123456789",
    title: "Focus Timer",
    observed: {
      rating: 4.8,
      reviews: 18420,
      category: "Productivity",
    },
    estimated: {
      downloads30d: 41000,
      revenue30dUsd: 76000,
      growthScore: 78,
    },
  },
  evidence: [
    {
      id: "ev_app_store_reviews",
      claim: "Focus Timer has 18,420 public App Store reviews in the US snapshot.",
      source: { type: "app_store", id: "apple:123456789", url: "https://apps.apple.com/us/app/id123456789" },
      valueKind: "observed",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: generatedAt,
      metric: { name: "review_count", value: 18420, unit: "reviews" },
    },
    {
      id: "ev_revenue_estimate",
      claim: "Revenue is directionally estimated from public signals, not reported by the Store.",
      source: { type: "model", id: "model:revenue@v1", url: null },
      valueKind: "modelled",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: generatedAt,
      metric: { name: "revenue_estimate_30d_usd", value: 76000, unit: "USD" },
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
      message: "Downloads, revenue, and Growth score are Estimated metrics and not Store truth.",
    },
  ],
  metadata: {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    generatedAt,
    sourceQuery: { appId: "apple:123456789" },
    snapshotId: "snapshot_us_2026_07_01",
    chartCountry: "US",
    growthPeriod: "7d",
    modelVersion: "intelligence-contract-fixture-v1",
  },
} satisfies IntelligenceResponseEnvelope<AppDetailContractExample, "app_detail">;

export interface TrendsContractExample {
  country: string;
  period: string;
  apps: Array<{
    appId: string;
    title: string;
    growthScore: number;
    reviewGrowth: number | null;
  }>;
}

export const trendsResponseExample = {
  responseType: "trends",
  status: "partial",
  data: {
    country: "US",
    period: "7d",
    apps: [
      {
        appId: "apple:123456789",
        title: "Focus Timer",
        growthScore: 78,
        reviewGrowth: 0.18,
      },
    ],
  },
  evidence: [
    {
      id: "ev_snapshot_growth",
      claim: "Growth score uses same-market Snapshot deltas for the selected period.",
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
    {
      kind: "estimated_metric",
      sourceType: "model",
      message: "Growth score is an Estimated metric, not a Store-reported growth rate.",
    },
  ],
  metadata: {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    generatedAt,
    sourceQuery: { country: "US", period: "7d" },
    snapshotId: "snapshot_us_2026_07_01",
    chartCountry: "US",
    growthPeriod: "7d",
    modelVersion: "intelligence-contract-fixture-v1",
  },
} satisfies IntelligenceResponseEnvelope<TrendsContractExample, "trends">;

export interface IdeaValidationContractExample {
  idea: string;
  verdict: "strong_opportunity" | "has_room" | "crowded" | "saturated" | "unvalidated" | "not_enough_data";
  competitors: string[];
  risks: string[];
}

export const ideaValidationResponseExample = {
  responseType: "idea_validation",
  status: "partial",
  data: {
    idea: "A focused timer for students with exam-week planning",
    verdict: "has_room",
    competitors: ["apple:123456789", "apple:987654321"],
    risks: ["Crowded productivity category", "Review pain evidence is partial"],
  },
  evidence: [
    {
      id: "ev_keyword_demand",
      claim: "Keyword demand is inferred from public search and competitor depth.",
      source: { type: "keyword", id: "keyword:focus timer", url: null },
      valueKind: "derived",
      sourceStatus: "ok",
      freshness: "fresh",
      observedAt: generatedAt,
      metric: { name: "keyword_difficulty", value: 43, unit: "score_0_100" },
    },
  ],
  confidence: {
    score: 0.59,
    label: "low",
    reasons: ["competitor evidence found", "review pain source is partial"],
  },
  caveats: [
    {
      kind: "partial_source",
      sourceType: "review",
      message: "Written Review coverage is partial, so pain-cluster confidence is capped.",
    },
  ],
  metadata: {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    generatedAt,
    sourceQuery: { idea: "focused timer for students" },
    snapshotId: "snapshot_us_2026_07_01",
    chartCountry: "US",
    growthPeriod: "7d",
    modelVersion: "intelligence-contract-fixture-v1",
  },
} satisfies IntelligenceResponseEnvelope<IdeaValidationContractExample, "idea_validation">;

export const reportResponseExample = {
  reportId: "report_focus_timer_us_2026_07_01",
  template: "opportunity-brief",
  format: "markdown",
  status: "partial",
  sourceQuery: { appId: "apple:123456789", country: "US" },
  evidenceSnapshot: {
    generatedAt,
    evidence: appDetailResponseExample.evidence,
    caveats: trendsResponseExample.caveats,
    confidence: trendsResponseExample.confidence,
  },
  output: {
    title: "Focus Timer opportunity brief",
    sections: ["market", "competition", "risks"],
  },
  outputMetadata: {
    title: "Focus Timer opportunity brief",
    generatedAt,
    expiresAt: "2026-07-08T12:00:00Z",
  },
} satisfies IntelligenceReportContract<{
  title: string;
  sections: string[];
}>;

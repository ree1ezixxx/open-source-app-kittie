/**
 * A stable fixture report used by tests and as a reference payload for callers
 * wiring the renderer up. Uses the `generic` template so it renders without any
 * template-specific package.
 */
import {
  INTELLIGENCE_CONTRACT_VERSION,
  type IntelligenceReportContract,
} from "@kittie/types";

export interface SampleReportOutput {
  headline: string;
  takeaways: string[];
}

export const sampleReport: IntelligenceReportContract<SampleReportOutput> = {
  reportId: "rpt_sample_0001",
  template: "generic",
  format: "json",
  status: "complete",
  sourceQuery: {
    appId: "com.example.focus",
    store: "app_store",
    country: "US",
    growthPeriod: "30d",
  },
  evidenceSnapshot: {
    generatedAt: "2026-07-01T00:00:00.000Z",
    confidence: {
      score: 0.72,
      label: "medium",
      reasons: [
        "Two independent sources agree on the review trend.",
        "Revenue is modelled, not observed.",
      ],
    },
    evidence: [
      {
        id: "ev_reviews_growth",
        claim: "Reviews grew 38% over the last 30 days.",
        source: { type: "review", id: "com.example.focus", url: null },
        valueKind: "observed",
        sourceStatus: "ok",
        freshness: "fresh",
        observedAt: "2026-06-30T00:00:00.000Z",
        metric: { name: "review_growth_pct", value: 38, unit: "%" },
      },
      {
        id: "ev_revenue_estimate",
        claim: "Estimated monthly revenue is around $42k.",
        source: { type: "model", id: "revenue-v3", url: null },
        valueKind: "modelled",
        sourceStatus: "ok",
        freshness: "fresh",
        observedAt: null,
        metric: { name: "revenue_month", value: 42000, unit: "USD" },
      },
    ],
    caveats: [
      {
        kind: "estimated_metric",
        sourceType: "model",
        message: "Revenue is a model estimate and may differ from actuals.",
      },
      {
        kind: "missing_source",
        sourceType: "meta_ads",
        message: "No ad intelligence available for this app.",
      },
    ],
  },
  output: {
    headline: "Focus is a fast-rising productivity app worth watching.",
    takeaways: [
      "Review velocity is accelerating month over month.",
      "Monetisation looks healthy on modelled revenue.",
      "No paid-acquisition signal yet — likely organic growth.",
    ],
  },
  outputMetadata: {
    title: "App teardown — Focus",
    generatedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
  },
};

/** Guards against contract-version drift in the fixture. */
export const SAMPLE_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

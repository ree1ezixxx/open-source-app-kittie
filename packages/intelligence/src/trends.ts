import type {
  Freshness,
  GrowthPeriod,
  IntelligenceCaveat,
  IntelligenceConfidence,
  IntelligenceEvidence,
  IntelligenceResponseEnvelope,
  Store,
  TrendAppResult,
  TrendsResponseData,
} from "@kittie/types";
import { appStoreUrl } from "./opportunity.js";
import { buildIntelligenceResponse } from "./intelligence-response.js";

export interface CategoryPulseAppInput {
  id: string;
  store: Store;
  title: string;
  developer: string;
  category: string | null;
  rating: number | null;
  reviewCount: number;
  reviewGrowth7d: number | null;
  growthPct: number | null;
  growthScore: number | null;
  rankDelta: number | null;
}

export interface BuildCategoryPulseInput {
  category: string | null;
  country: string;
  growthPeriod: GrowthPeriod;
  limit: number;
  apps: CategoryPulseAppInput[];
  snapshotDate: string | null;
  generatedAt: string;
  modelVersion?: string;
}

const DEFAULT_MODEL_VERSION = "category-pulse-v1";

export function buildCategoryPulseResponse(
  input: BuildCategoryPulseInput,
): IntelligenceResponseEnvelope<TrendsResponseData, "trends"> {
  const sourceState = snapshotSourceState(input.snapshotDate, input.generatedAt);
  const observedAt = input.snapshotDate ? `${input.snapshotDate}T00:00:00Z` : null;
  const apps = input.apps.slice(0, input.limit);
  const evidence: IntelligenceEvidence[] = [];
  const rankedApps: TrendAppResult[] = apps.map((app, index) => {
    const movementEvidenceId = `ev_${safeEvidenceId(app.id)}_movement`;
    const reviewEvidenceId = `ev_${safeEvidenceId(app.id)}_reviews`;

    evidence.push({
      id: movementEvidenceId,
      claim: `${app.title} ranks #${index + 1} for ${input.growthPeriod} movement in ${input.country}.`,
      source: {
        type: "snapshot",
        id: input.snapshotDate ? `snapshot_${input.country}_${input.snapshotDate}` : `snapshot_${input.country}_missing`,
        url: null,
      },
      valueKind: "modelled",
      sourceStatus: sourceState.sourceStatus,
      freshness: sourceState.freshness,
      observedAt,
      metric: { name: "growth_score", value: app.growthScore, unit: "score_0_100" },
    });

    evidence.push({
      id: reviewEvidenceId,
      claim: `${app.title} has ${app.reviewCount.toLocaleString()} public Store reviews in ${input.country}.`,
      source: { type: app.store === "google" ? "google_play" : "app_store", id: app.id, url: appStoreUrl(app) },
      valueKind: "observed",
      sourceStatus: sourceState.sourceStatus,
      freshness: sourceState.freshness,
      observedAt,
      metric: { name: "review_count", value: app.reviewCount, unit: "reviews" },
    });

    return {
      rank: index + 1,
      appId: app.id,
      store: app.store,
      title: app.title,
      developer: app.developer,
      category: app.category,
      rating: app.rating,
      reviewCount: app.reviewCount,
      movement: {
        reviewGrowth: app.reviewGrowth7d,
        reviewGrowthPct: app.growthPct,
        rankDelta: app.rankDelta,
        growthScore: app.growthScore,
      },
      evidenceIds: [movementEvidenceId, reviewEvidenceId],
    };
  });

  const confidence = categoryPulseConfidence(apps, input.limit, sourceState.freshness);
  const caveats: IntelligenceCaveat[] = [
    {
      kind: "estimated_metric",
      sourceType: "model",
      message: "Growth score and Revenue/Download estimates are Estimated metrics, not Store-reported facts.",
    },
  ];

  if (!input.snapshotDate) {
    caveats.push({
      kind: "missing_source",
      sourceType: "snapshot",
      message: "No Snapshot rows matched this category/country query.",
    });
  } else if (sourceState.freshness === "stale") {
    caveats.push({
      kind: "stale_source",
      sourceType: "snapshot",
      message: `Latest Snapshot for ${input.country} is ${input.snapshotDate}; market movement may have changed.`,
    });
  } else if (sourceState.freshness === "aging") {
    caveats.push({
      kind: "partial_source",
      sourceType: "snapshot",
      message: `Latest Snapshot for ${input.country} is ${input.snapshotDate}; confidence is capped until today's refresh lands.`,
    });
  }
  if (rankedApps.length === 0 && input.snapshotDate) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "snapshot",
      message: "Snapshot data exists for this country, but no Apps matched the requested category.",
    });
  }

  return buildIntelligenceResponse({
    responseType: "trends",
    data: {
      category: input.category,
      country: input.country,
      growthPeriod: input.growthPeriod,
      limit: input.limit,
      snapshotDate: input.snapshotDate,
      apps: rankedApps,
    },
    evidence,
    confidence,
    caveats,
    metadata: {
      generatedAt: input.generatedAt,
      sourceQuery: {
        category: input.category,
        country: input.country,
        growthPeriod: input.growthPeriod,
        limit: input.limit,
      },
      snapshotId: input.snapshotDate ? `snapshot_${input.country}_${input.snapshotDate}` : null,
      chartCountry: input.country,
      growthPeriod: input.growthPeriod,
      modelVersion: input.modelVersion ?? DEFAULT_MODEL_VERSION,
    },
  });
}

function snapshotSourceState(
  snapshotDate: string | null,
  generatedAt: string,
): { freshness: Freshness; sourceStatus: "ok" | "stale" | "not_attempted" } {
  if (!snapshotDate) return { freshness: "unknown", sourceStatus: "not_attempted" };
  const generated = new Date(generatedAt);
  const observed = new Date(`${snapshotDate}T00:00:00Z`);
  const ageDays = Math.floor((generated.getTime() - observed.getTime()) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 0) return { freshness: "unknown", sourceStatus: "stale" };
  if (ageDays <= 1) return { freshness: "fresh", sourceStatus: "ok" };
  if (ageDays <= 7) return { freshness: "aging", sourceStatus: "stale" };
  return { freshness: "stale", sourceStatus: "stale" };
}

function categoryPulseConfidence(
  apps: CategoryPulseAppInput[],
  limit: number,
  freshness: Freshness,
): IntelligenceConfidence {
  if (!apps.length) {
    return {
      score: 0,
      label: "insufficient",
      reasons: ["no ranked Apps had matching Snapshot evidence"],
    };
  }

  const movementCoverage =
    apps.filter((app) => app.growthScore != null || app.growthPct != null || app.rankDelta != null).length / apps.length;
  const sampleCoverage = Math.min(apps.length / Math.max(limit, 1), 1);
  let score = Math.min(0.86, 0.42 + movementCoverage * 0.28 + sampleCoverage * 0.16);
  const reasons = [
    `${apps.length} ranked Apps returned`,
    `${Math.round(movementCoverage * 100)}% have movement metrics`,
  ];

  if (freshness === "aging") {
    score = Math.min(score, 0.59);
    reasons.push("Snapshot source is aging");
  } else if (freshness === "stale" || freshness === "unknown") {
    score = Math.min(score, 0.39);
    reasons.push(freshness === "unknown" ? "Snapshot source is missing" : "Snapshot source is stale");
  } else {
    reasons.push("Snapshot source is fresh");
  }

  return { score: round2(score), label: labelForScore(score), reasons };
}

function labelForScore(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeEvidenceId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "app";
}

import { buildIntelligenceResponse, type MissingIntelligenceSource } from "@kittie/intelligence";
import type {
  AppDetail,
  AppDetailIntelligenceData,
  AppDetailIntelligenceRequest,
  AppDetailIntelligenceResponse,
  AppListItem,
  AppSearchParams,
  IntelligenceCaveat,
  IntelligenceConfidence,
  IntelligenceEvidence,
  IntelligenceSourceType,
  PaginatedResponse,
} from "@kittie/types";
import { getAppByAnyId, searchApps } from "./app-service.js";

const MODEL_VERSION = "app-detail-intelligence-v1";

export class AppDetailIntelligenceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppDetailIntelligenceError";
  }
}

interface AppDetailIntelligenceDeps {
  getAppByAnyId(id: string): Promise<AppDetail | null>;
  searchApps(params: AppSearchParams): Promise<PaginatedResponse<AppListItem>>;
  now(): Date;
}

const defaultDeps: AppDetailIntelligenceDeps = {
  getAppByAnyId,
  searchApps,
  now: () => new Date(),
};

export async function getAppDetailIntelligence(
  input: AppDetailIntelligenceRequest,
  deps: AppDetailIntelligenceDeps = defaultDeps,
): Promise<AppDetailIntelligenceResponse> {
  const app = await resolveApp(input, deps);
  return buildAppDetailIntelligence(app, sourceQueryFor(input), deps.now());
}

export function buildAppDetailIntelligence(
  app: AppDetail,
  sourceQuery: Record<string, string | number | boolean | null>,
  generatedAt: Date = new Date(),
): AppDetailIntelligenceResponse {
  const latest = app.historicals.at(-1) ?? null;
  const generatedIso = generatedAt.toISOString();
  const snapshotObservedAt = latest?.date ? `${latest.date}T00:00:00.000Z` : null;
  const snapshotFreshness = freshnessForSnapshot(latest?.date ?? null, generatedAt);
  const snapshotStatus = snapshotFreshness === "stale" ? "stale" : "ok";
  const snapshotId = latest ? `snapshot:${app.id}:US:${latest.date}` : null;
  const storeSource = storeSourceFor(app);
  const evidence: IntelligenceEvidence[] = [
    {
      id: "app_identity",
      claim: `${app.title} is a ${app.store} app by ${app.developer}.`,
      source: storeSource,
      valueKind: "observed",
      sourceStatus: "ok",
      freshness: snapshotFreshness === "unknown" ? "unknown" : "fresh",
      observedAt: app.updatedAt ?? app.releasedAt ?? null,
      metric: { name: "store_app_id", value: app.storeAppId, unit: null },
    },
    {
      id: "store_reviews",
      claim: `${app.title} has ${app.reviewCount.toLocaleString("en-US")} public Store reviews in the local snapshot.`,
      source: storeSource,
      valueKind: "observed",
      sourceStatus: snapshotStatus,
      freshness: snapshotFreshness,
      observedAt: snapshotObservedAt,
      metric: { name: "review_count", value: app.reviewCount, unit: "reviews" },
    },
  ];

  if (app.rating !== null) {
    evidence.push({
      id: "store_rating",
      claim: `${app.title} has a ${app.rating.toFixed(1)} Store rating in the local snapshot.`,
      source: storeSource,
      valueKind: "observed",
      sourceStatus: snapshotStatus,
      freshness: snapshotFreshness,
      observedAt: snapshotObservedAt,
      metric: { name: "rating", value: app.rating, unit: "stars" },
    });
  }

  addModelEvidence(evidence, "downloads_estimate", app.downloadsEstimate30d, "downloads_estimate_30d", "downloads", snapshotId, snapshotFreshness, snapshotObservedAt);
  addModelEvidence(evidence, "revenue_estimate", app.revenueEstimate30d, "revenue_estimate_30d_usd", "USD", snapshotId, snapshotFreshness, snapshotObservedAt);
  addModelEvidence(evidence, "growth_score", app.growthScore, "growth_score", "score_0_100", snapshotId, snapshotFreshness, snapshotObservedAt);

  if (app.screenshotUrls.length > 0) {
    evidence.push({
      id: "listing_media",
      claim: `${app.title} has ${app.screenshotUrls.length} Listing media screenshots stored locally.`,
      source: storeSource,
      valueKind: "observed",
      sourceStatus: "ok",
      freshness: snapshotFreshness === "unknown" ? "unknown" : "fresh",
      observedAt: snapshotObservedAt,
      metric: { name: "listing_media_count", value: app.screenshotUrls.length, unit: "screenshots" },
    });
  }

  const caveats: IntelligenceCaveat[] = [
    {
      kind: "estimated_metric",
      sourceType: "model",
      message: "Downloads, revenue, and Growth score are Estimated metrics from local public-signal models.",
    },
  ];
  const missingSources: MissingIntelligenceSource[] = [];
  if (app.screenshotUrls.length === 0) {
    missingSources.push({
      sourceType: sourceTypeForStore(app.store),
      message: "Listing media is missing locally; confidence is lowered instead of inventing screenshots.",
    });
  }
  if (!latest) {
    missingSources.push({
      sourceType: "snapshot",
      message: "No Snapshot is available for this app; metric confidence is insufficient.",
    });
  } else if (snapshotFreshness === "stale") {
    caveats.push({
      kind: "stale_source",
      sourceType: "snapshot",
      message: `Latest Snapshot is stale (${latest.date}); confidence is lowered.`,
    });
  }

  const confidence = confidenceFor(app, latest?.date ?? null, generatedAt, missingSources, caveats);
  return buildIntelligenceResponse({
    responseType: "app_detail",
    data: dataForApp(app),
    evidence,
    confidence,
    caveats,
    missingSources,
    metadata: {
      generatedAt: generatedIso,
      sourceQuery,
      snapshotId,
      chartCountry: "US",
      growthPeriod: "7d",
      modelVersion: MODEL_VERSION,
    },
  });
}

async function resolveApp(input: AppDetailIntelligenceRequest, deps: AppDetailIntelligenceDeps): Promise<AppDetail> {
  const appId = input.appId?.trim();
  const query = input.query?.trim();
  if ((appId && query) || (!appId && !query)) {
    throw new AppDetailIntelligenceError("Provide exactly one of appId or query.", 400);
  }

  if (appId) {
    const app = await deps.getAppByAnyId(appId);
    if (!app) throw new AppDetailIntelligenceError(`App not found for appId: ${appId}`, 404);
    return app;
  }

  const result = await deps.searchApps({ search: query!, source: input.store, limit: 5 });
  if (result.pagination.totalCount === 0 || result.data.length === 0) {
    throw new AppDetailIntelligenceError(`App not found for query: ${query}`, 404);
  }
  if (result.pagination.totalCount > 1 || result.data.length > 1) {
    throw new AppDetailIntelligenceError("App query is ambiguous; provide a specific appId.", 409, {
      candidates: result.data.slice(0, 5).map((app) => ({
        id: app.id,
        title: app.title,
        developer: app.developer,
        store: app.store,
        storeAppId: app.storeAppId,
      })),
    });
  }
  const app = await deps.getAppByAnyId(result.data[0]!.id);
  if (!app) throw new AppDetailIntelligenceError(`Resolved app detail is unavailable for query: ${query}`, 404);
  return app;
}

function dataForApp(app: AppDetail): AppDetailIntelligenceData {
  return {
    app: {
      id: app.id,
      store: app.store,
      storeAppId: app.storeAppId,
      title: app.title,
      developer: app.developer,
      category: app.category,
      iconUrl: app.iconUrl,
      releasedAt: app.releasedAt,
      updatedAt: app.updatedAt,
    },
    observed: {
      rating: app.rating,
      reviewCount: app.reviewCount,
      chartRank: latestHistorical(app)?.chartRank ?? null,
      listingMediaCount: app.screenshotUrls.length,
      hasDescription: Boolean(app.description),
      hasWebsite: Boolean(app.websiteUrl),
    },
    estimated: {
      downloads30d: app.downloadsEstimate30d,
      revenue30dUsd: app.revenueEstimate30d,
      growthScore: app.growthScore,
      growthPct: app.growthPct,
      isFirstMover: app.isFirstMover,
    },
    relationships: {
      inAppPurchaseCount: app.iaps.length,
      metaAdCount: app.metaAds.length,
      appleSearchAdCount: app.appleSearchAds.length,
      creatorCount: app.creators.length,
      reviewSampleCount: app.historicals.length,
    },
  };
}

function addModelEvidence(
  evidence: IntelligenceEvidence[],
  id: string,
  value: number | null,
  metricName: string,
  unit: string,
  snapshotId: string | null,
  freshness: "fresh" | "aging" | "stale" | "unknown",
  observedAt: string | null,
): void {
  if (value === null) return;
  evidence.push({
    id,
    claim: `${metricName} is modelled from local Store signals and should be treated as directional.`,
    source: { type: "model", id: MODEL_VERSION, url: null },
    valueKind: "modelled",
    sourceStatus: snapshotId ? (freshness === "stale" ? "stale" : "ok") : "not_attempted",
    freshness,
    observedAt,
    metric: { name: metricName, value, unit },
  });
}

function confidenceFor(
  app: AppDetail,
  snapshotDate: string | null,
  generatedAt: Date,
  missingSources: MissingIntelligenceSource[],
  caveats: IntelligenceCaveat[],
): IntelligenceConfidence {
  let score = 0.76;
  const reasons = ["app identity and Store metrics are grounded in local data"];
  if (app.rating === null) {
    score -= 0.08;
    reasons.push("rating is unavailable");
  }
  if (app.downloadsEstimate30d === null || app.revenueEstimate30d === null || app.growthScore === null) {
    score -= 0.1;
    reasons.push("one or more Estimated metrics are unavailable");
  } else {
    reasons.push("Estimated metrics are present but directional");
  }
  if (app.screenshotUrls.length === 0) score -= 0.16;
  if (!snapshotDate) score = Math.min(score, 0.34);
  else {
    const age = snapshotAgeDays(snapshotDate, generatedAt);
    if (age > 14) score -= 0.18;
    else if (age > 2) score -= 0.08;
  }
  if (missingSources.length > 0) score -= 0.08 * missingSources.length;
  if (caveats.some((c) => c.kind === "stale_source")) reasons.push("Snapshot data is stale");
  const rounded = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return { score: rounded, label: labelForScore(rounded), reasons };
}

function freshnessForSnapshot(date: string | null, generatedAt: Date): "fresh" | "aging" | "stale" | "unknown" {
  if (!date) return "unknown";
  const age = snapshotAgeDays(date, generatedAt);
  if (age <= 2) return "fresh";
  if (age <= 14) return "aging";
  return "stale";
}

function snapshotAgeDays(date: string, generatedAt: Date): number {
  const t = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((generatedAt.getTime() - t) / 86_400_000);
}

function labelForScore(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

function latestHistorical(app: AppDetail) {
  return app.historicals.at(-1) ?? null;
}

function storeSourceFor(app: AppDetail): IntelligenceEvidence["source"] {
  return {
    type: sourceTypeForStore(app.store),
    id: `${app.store}:${app.storeAppId}`,
    url:
      app.store === "apple"
        ? `https://apps.apple.com/us/app/id${app.storeAppId}`
        : `https://play.google.com/store/apps/details?id=${app.storeAppId}`,
  };
}

function sourceTypeForStore(store: AppDetail["store"]): IntelligenceSourceType {
  return store === "apple" ? "app_store" : "google_play";
}

function sourceQueryFor(input: AppDetailIntelligenceRequest): Record<string, string | number | boolean | null> {
  return {
    appId: input.appId ?? null,
    query: input.query ?? null,
    store: input.store ?? null,
  };
}

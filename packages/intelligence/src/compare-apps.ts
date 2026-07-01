import type {
  AppDetail,
  CompareAppsDimension,
  CompareAppsInsight,
  CompareAppsIntelligenceData,
  CompareAppsIntelligenceResponse,
  CompareAppsRow,
  IntelligenceCaveat,
  IntelligenceConfidence,
  IntelligenceEvidence,
} from "@kittie/types";
import { buildIntelligenceResponse } from "./intelligence-response.js";

const DEFAULT_MODEL_VERSION = "compare-apps-v1";

export interface BuildCompareAppsInput {
  apps: AppDetail[];
  generatedAt: string;
  sourceQuery: Record<string, string | number | boolean | null>;
  modelVersion?: string;
}

const dimensions: CompareAppsDimension[] = [
  { key: "category", label: "Category", valueType: "text", unit: null, higherIsBetter: null },
  { key: "rating", label: "Rating", valueType: "number", unit: "stars", higherIsBetter: true },
  { key: "reviews", label: "Reviews", valueType: "number", unit: "reviews", higherIsBetter: true },
  { key: "growth_score", label: "Growth score", valueType: "number", unit: "score_0_100", higherIsBetter: true },
  { key: "growth_pct", label: "Growth %", valueType: "percent", unit: "percent", higherIsBetter: true },
  { key: "downloads_30d", label: "Downloads 30d", valueType: "number", unit: "downloads", higherIsBetter: true },
  { key: "revenue_30d_usd", label: "Revenue 30d", valueType: "currency", unit: "USD", higherIsBetter: true },
  { key: "chart_rank", label: "Chart rank", valueType: "number", unit: "rank", higherIsBetter: false },
  { key: "listing_media", label: "Listing media", valueType: "number", unit: "screenshots", higherIsBetter: true },
  { key: "monetization_signals", label: "Monetization signals", valueType: "number", unit: "items", higherIsBetter: true },
  { key: "marketing_signals", label: "Marketing signals", valueType: "number", unit: "items", higherIsBetter: true },
];

export function buildCompareAppsResponse(input: BuildCompareAppsInput): CompareAppsIntelligenceResponse {
  if (input.apps.length < 2) {
    throw new CompareAppsError("Compare requires at least two Apps.");
  }

  const evidence: IntelligenceEvidence[] = [];
  const caveatMessages = new Set<string>();
  const rows = input.apps.map((app) => rowForApp(app, input.generatedAt, evidence, caveatMessages));
  const caveats = caveatsFor(caveatMessages, input.apps);
  const insights = insightsFor(rows, evidence);
  const confidence = confidenceFor(rows, input.apps, caveats);
  const missingSources =
    caveatMessages.size > 0
      ? [
          {
            sourceType: "snapshot" as const,
            message: "One or more compared Apps have missing or partial fields; see caveats for per-App details.",
          },
        ]
      : undefined;

  return buildIntelligenceResponse({
    responseType: "compare_apps",
    data: { dimensions, rows, insights },
    evidence,
    confidence,
    caveats,
    missingSources,
    metadata: {
      generatedAt: input.generatedAt,
      sourceQuery: input.sourceQuery,
      snapshotId: latestSharedSnapshotId(input.apps),
      chartCountry: "US",
      growthPeriod: "7d",
      modelVersion: input.modelVersion ?? DEFAULT_MODEL_VERSION,
    },
  });
}

export class CompareAppsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompareAppsError";
  }
}

function rowForApp(
  app: AppDetail,
  generatedAt: string,
  evidence: IntelligenceEvidence[],
  caveatMessages: Set<string>,
): CompareAppsRow {
  const latest = app.historicals.at(-1) ?? null;
  const freshness = freshnessForSnapshot(latest?.date ?? null, generatedAt);
  const observedAt = latest?.date ? `${latest.date}T00:00:00.000Z` : null;
  const sourceStatus = freshness === "stale" ? "stale" : latest ? "ok" : "not_attempted";
  const source = storeSourceFor(app);
  const evidenceIds: string[] = [];
  const rowCaveats: string[] = [];

  const addEvidence = (entry: IntelligenceEvidence) => {
    evidence.push(entry);
    evidenceIds.push(entry.id);
  };
  const addCaveat = (message: string) => {
    rowCaveats.push(message);
    caveatMessages.add(message);
  };

  addEvidence({
    id: evidenceId(app, "identity"),
    claim: `${app.title} is a ${app.store} app by ${app.developer}.`,
    source,
    valueKind: "observed",
    sourceStatus: "ok",
    freshness: freshness === "unknown" ? "unknown" : "fresh",
    observedAt: app.updatedAt ?? app.releasedAt ?? null,
    metric: { name: "store_app_id", value: app.storeAppId, unit: null },
  });

  addEvidence({
    id: evidenceId(app, "reviews"),
    claim: `${app.title} has ${app.reviewCount.toLocaleString("en-US")} public Store reviews.`,
    source,
    valueKind: "observed",
    sourceStatus,
    freshness,
    observedAt,
    metric: { name: "review_count", value: app.reviewCount, unit: "reviews" },
  });

  if (app.rating == null) addCaveat(`${app.title}: rating is unavailable.`);
  else addMetricEvidence(app, "rating", app.rating, "stars", "observed", source, sourceStatus, freshness, observedAt, addEvidence);

  addEstimatedMetric(app, "growth_score", app.growthScore, "score_0_100", freshness, observedAt, addEvidence, addCaveat);
  addEstimatedMetric(app, "growth_pct", app.growthPct, "percent", freshness, observedAt, addEvidence, addCaveat);
  addEstimatedMetric(app, "downloads_30d", app.downloadsEstimate30d, "downloads", freshness, observedAt, addEvidence, addCaveat);
  addEstimatedMetric(app, "revenue_30d_usd", app.revenueEstimate30d, "USD", freshness, observedAt, addEvidence, addCaveat);

  if (!latest) addCaveat(`${app.title}: no Snapshot is available.`);
  else if (freshness === "stale") addCaveat(`${app.title}: latest Snapshot is stale (${latest.date}).`);

  if (latest?.chartRank != null) {
    addMetricEvidence(app, "chart_rank", latest.chartRank, "rank", "observed", source, sourceStatus, freshness, observedAt, addEvidence);
  } else {
    addCaveat(`${app.title}: chart rank is unavailable.`);
  }

  if (app.screenshotUrls.length > 0) {
    addMetricEvidence(app, "listing_media", app.screenshotUrls.length, "screenshots", "observed", source, sourceStatus, freshness, observedAt, addEvidence);
  } else {
    addCaveat(`${app.title}: Listing media is missing locally.`);
  }

  const monetizationSignals = app.iaps.length;
  if (monetizationSignals > 0) {
    addMetricEvidence(app, "monetization_signals", monetizationSignals, "items", "observed", source, sourceStatus, freshness, observedAt, addEvidence);
  }

  const marketingSignals = app.metaAds.length + app.appleSearchAds.length + app.creators.length;
  if (marketingSignals > 0) {
    addMetricEvidence(app, "marketing_signals", marketingSignals, "items", "observed", source, sourceStatus, freshness, observedAt, addEvidence);
  } else {
    addCaveat(`${app.title}: marketing signals are not ingested or unavailable.`);
  }

  return {
    appId: app.id,
    store: app.store,
    storeAppId: app.storeAppId,
    title: app.title,
    developer: app.developer,
    category: app.category,
    iconUrl: app.iconUrl,
    values: {
      category: app.category,
      rating: app.rating,
      reviews: app.reviewCount,
      growth_score: app.growthScore,
      growth_pct: app.growthPct,
      downloads_30d: app.downloadsEstimate30d,
      revenue_30d_usd: app.revenueEstimate30d,
      chart_rank: latest?.chartRank ?? null,
      listing_media: app.screenshotUrls.length || null,
      monetization_signals: monetizationSignals || null,
      marketing_signals: marketingSignals || null,
    },
    evidenceIds,
    caveats: rowCaveats,
  };
}

function addEstimatedMetric(
  app: AppDetail,
  name: string,
  value: number | null,
  unit: string,
  freshness: IntelligenceEvidence["freshness"],
  observedAt: string | null,
  addEvidence: (entry: IntelligenceEvidence) => void,
  addCaveat: (message: string) => void,
): void {
  if (value == null) {
    addCaveat(`${app.title}: ${name} estimate is unavailable.`);
    return;
  }
  addMetricEvidence(
    app,
    name,
    value,
    unit,
    "modelled",
    { type: "model", id: DEFAULT_MODEL_VERSION, url: null },
    freshness === "stale" ? "stale" : "ok",
    freshness,
    observedAt,
    addEvidence,
  );
}

function addMetricEvidence(
  app: AppDetail,
  name: string,
  value: string | number | boolean | null,
  unit: string | null,
  valueKind: IntelligenceEvidence["valueKind"],
  source: IntelligenceEvidence["source"],
  sourceStatus: IntelligenceEvidence["sourceStatus"],
  freshness: IntelligenceEvidence["freshness"],
  observedAt: string | null,
  addEvidence: (entry: IntelligenceEvidence) => void,
): void {
  addEvidence({
    id: evidenceId(app, name),
    claim: `${app.title}: ${name} = ${value ?? "unknown"}.`,
    source,
    valueKind,
    sourceStatus,
    freshness,
    observedAt,
    metric: { name, value, unit },
  });
}

function caveatsFor(messages: Set<string>, apps: AppDetail[]): IntelligenceCaveat[] {
  const caveats: IntelligenceCaveat[] = [
    {
      kind: "estimated_metric",
      sourceType: "model",
      message: "Growth, downloads, and revenue are Estimated metrics from local public-signal models.",
    },
  ];
  for (const message of messages) {
    caveats.push({
      kind: message.includes("stale") ? "stale_source" : message.includes("unavailable") || message.includes("missing") ? "missing_source" : "partial_source",
      sourceType: sourceTypeForMessage(message),
      message,
    });
  }
  if (new Set(apps.map((app) => app.category).filter(Boolean)).size > 1) {
    caveats.push({
      kind: "partial_source",
      sourceType: "snapshot",
      message: "Apps span multiple categories; compare ranks and estimates directionally.",
    });
  }
  return caveats;
}

function insightsFor(rows: CompareAppsRow[], evidence: IntelligenceEvidence[]): CompareAppsInsight[] {
  const insights: CompareAppsInsight[] = [];
  addLeaderInsight(rows, evidence, insights, "reviews", "Most reviewed");
  addLeaderInsight(rows, evidence, insights, "growth_score", "Highest Growth score");
  addLeaderInsight(rows, evidence, insights, "revenue_30d_usd", "Highest Revenue estimate");

  const missing = rows.filter((row) => row.caveats.length > 0);
  if (missing.length > 0) {
    insights.push({
      kind: "missing_data",
      message: `${missing.length} compared App${missing.length === 1 ? "" : "s"} have missing or partial fields.`,
      evidenceIds: missing.flatMap((row) => row.evidenceIds).slice(0, 6),
    });
  }
  return insights;
}

function addLeaderInsight(
  rows: CompareAppsRow[],
  evidence: IntelligenceEvidence[],
  insights: CompareAppsInsight[],
  key: keyof CompareAppsRow["values"],
  label: string,
): void {
  const ranked = rows
    .map((row) => ({ row, value: row.values[key] }))
    .filter((entry): entry is { row: CompareAppsRow; value: number } => typeof entry.value === "number")
    .sort((a, b) => b.value - a.value);
  const leader = ranked[0];
  if (!leader) return;
  const ev = evidence.find((entry) => entry.id === evidenceId({ id: leader.row.appId } as AppDetail, key));
  insights.push({
    kind: "leader",
    message: `${label}: ${leader.row.title}.`,
    evidenceIds: ev ? [ev.id] : leader.row.evidenceIds.slice(0, 1),
  });
}

function confidenceFor(rows: CompareAppsRow[], apps: AppDetail[], caveats: IntelligenceCaveat[]): IntelligenceConfidence {
  const totalFields = rows.length * dimensions.length;
  const presentFields = rows.reduce(
    (sum, row) => sum + dimensions.filter((dimension) => row.values[dimension.key] != null).length,
    0,
  );
  const coverage = totalFields === 0 ? 0 : presentFields / totalFields;
  let score = 0.35 + coverage * 0.45 + Math.min(apps.length, 5) * 0.03;
  if (caveats.some((caveat) => caveat.kind === "stale_source")) score = Math.min(score, 0.59);
  if (coverage < 0.5) score = Math.min(score, 0.49);
  const rounded = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return {
    score: rounded,
    label: labelForScore(rounded),
    reasons: [
      `${apps.length} Apps compared`,
      `${Math.round(coverage * 100)}% of comparable fields are present`,
      caveats.length > 1 ? "missing or partial fields are explicit caveats" : "core comparison fields are present",
    ],
  };
}

function latestSharedSnapshotId(apps: AppDetail[]): string | null {
  const latestDates = apps.map((app) => app.historicals.at(-1)?.date).filter((date): date is string => Boolean(date));
  if (!latestDates.length) return null;
  return `compare:US:${latestDates.sort().at(-1)}`;
}

function freshnessForSnapshot(date: string | null, generatedAt: string): IntelligenceEvidence["freshness"] {
  if (!date) return "unknown";
  const observed = Date.parse(`${date}T00:00:00.000Z`);
  const generated = Date.parse(generatedAt);
  const ageDays = Math.floor((generated - observed) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 0) return "unknown";
  if (ageDays <= 2) return "fresh";
  if (ageDays <= 14) return "aging";
  return "stale";
}

function labelForScore(score: number): IntelligenceConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  if (score > 0) return "low";
  return "insufficient";
}

function storeSourceFor(app: AppDetail): IntelligenceEvidence["source"] {
  return {
    type: app.store === "apple" ? "app_store" : "google_play",
    id: `${app.store}:${app.storeAppId}`,
    url:
      app.store === "apple"
        ? `https://apps.apple.com/us/app/id${app.storeAppId}`
        : `https://play.google.com/store/apps/details?id=${app.storeAppId}`,
  };
}

function sourceTypeForMessage(message: string): IntelligenceCaveat["sourceType"] {
  if (message.includes("marketing")) return "meta_ads";
  if (message.includes("Snapshot") || message.includes("chart rank")) return "snapshot";
  if (message.includes("estimate")) return "model";
  return "app_store";
}

function evidenceId(app: Pick<AppDetail, "id">, metric: string | number | symbol): string {
  return `ev_${safeId(app.id)}_${safeId(String(metric))}`;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "app";
}

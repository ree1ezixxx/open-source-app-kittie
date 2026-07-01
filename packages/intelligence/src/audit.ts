import type {
  AuditMetricInput,
  AuditReport,
  ConfidenceScore,
  GrowthPeriod,
  SourceStatus,
  Store,
} from "@kittie/types";
import { computeGrowthScore } from "./growth.js";
import type { AppSignals } from "./types.js";

export interface ConfidenceSignal {
  status: SourceStatus;
  weight: number;
}

export interface ConfidenceInput {
  sources: ConfidenceSignal[];
  sampleSize: number | null;
  observedAt: Date | null;
  now?: Date;
  expectedFreshDays?: number;
  agreement?: SourceStatus;
}

export interface BuildAuditReportInput {
  app: {
    id: string;
    store: Store;
    storeAppId: string;
    title: string;
    developer: string;
    iconUrl: string | null;
    category: string | null;
  };
  signals: AppSignals;
  period?: GrowthPeriod;
  observedAt: Date | null;
  now?: Date;
}

function clampScore(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 100));
}

function statusValue(status: SourceStatus): number {
  if (status === "available") return 1;
  if (status === "partial") return 0.55;
  return 0;
}

function statusFromValue(value: unknown): SourceStatus {
  return value == null ? "unavailable" : "available";
}

function confidenceLabel(value: number): ConfidenceScore["label"] {
  if (value >= 80) return "High";
  if (value >= 60) return "Medium";
  if (value >= 35) return "Low";
  return "Experimental";
}

function sampleScore(sampleSize: number | null): number {
  if (sampleSize == null) return 0;
  if (sampleSize >= 1_000) return 1;
  if (sampleSize >= 100) return 0.75;
  if (sampleSize > 0) return 0.4;
  return 0.2;
}

function freshnessScore(observedAt: Date | null, now: Date, expectedFreshDays: number): number {
  if (!observedAt) return 0;
  const ageDays = Math.max((now.getTime() - observedAt.getTime()) / 86_400_000, 0);
  if (ageDays <= expectedFreshDays) return 1;
  if (ageDays <= expectedFreshDays * 3) return 0.6;
  return 0.25;
}

function sourceCoverageScore(sources: ConfidenceSignal[]): number {
  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) return 0;
  const covered = sources.reduce((sum, s) => sum + statusValue(s.status) * s.weight, 0);
  return covered / totalWeight;
}

export function computeConfidenceScore(input: ConfidenceInput): ConfidenceScore {
  const now = input.now ?? new Date();
  const expectedFreshDays = input.expectedFreshDays ?? 7;
  const sourceScore = sourceCoverageScore(input.sources);
  const sample = sampleScore(input.sampleSize);
  const freshness = freshnessScore(input.observedAt, now, expectedFreshDays);
  const agreement = statusValue(input.agreement ?? "partial");
  const value = clampScore(sourceScore * 45 + sample * 20 + freshness * 20 + agreement * 15);
  return { value, label: confidenceLabel(value) };
}

function metric(label: string, value: AuditMetricInput["value"], unit: AuditMetricInput["unit"]): AuditMetricInput {
  return { label, value, unit, sourceStatus: statusFromValue(value) };
}

function sourceStatus(inputs: AuditMetricInput[]): SourceStatus {
  const available = inputs.filter((i) => i.sourceStatus === "available").length;
  if (available === inputs.length) return "available";
  if (available > 0) return "partial";
  return "unavailable";
}

export function buildAuditReport(input: BuildAuditReportInput): AuditReport {
  const period = input.period ?? "7d";
  const observedAt = input.observedAt?.toISOString() ?? null;
  const momentum = computeGrowthScore(input.signals, period);
  const momentumInputs: AuditMetricInput[] = [
    metric("Review count", input.signals.reviewCount, "count"),
    metric("Prior review count", input.signals.reviewCountPrior, "count"),
    metric("Chart rank", input.signals.chartRank, "rank"),
    metric("Prior chart rank", input.signals.chartRankPrior, "rank"),
    metric("Meta ads", input.signals.metaAdCount, "count"),
    metric("Prior Meta ads", input.signals.metaAdCountPrior, "count"),
    metric("Updated", input.signals.updatedAt?.toISOString().slice(0, 10) ?? null, "date"),
  ];
  const cardStatus = sourceStatus(momentumInputs);
  const confidence = computeConfidenceScore({
    sources: [
      { status: momentumInputs[0]!.sourceStatus, weight: 2 },
      { status: momentumInputs[1]!.sourceStatus, weight: 2 },
      { status: sourceStatus(momentumInputs.slice(2, 4)), weight: 1.5 },
      { status: sourceStatus(momentumInputs.slice(4, 6)), weight: 1 },
      { status: momentumInputs[6]!.sourceStatus, weight: 1 },
    ],
    sampleSize: input.signals.reviewCount,
    observedAt: input.observedAt,
    now: input.now,
    agreement: cardStatus,
  });

  return {
    app: input.app,
    period,
    generatedAt: (input.now ?? new Date()).toISOString(),
    confidence,
    subScores: [{ name: "Momentum", value: momentum, inputs: momentumInputs }],
    evidence: [
      {
        id: "momentum-signals",
        title: "Momentum signals",
        summary: "Growth combines review velocity, chart movement, ad activity, and update recency.",
        sourceStatus: cardStatus,
        observedAt,
        inputs: momentumInputs,
      },
    ],
  };
}

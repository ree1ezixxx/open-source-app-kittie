import type { AuditReport, SubScore, EvidenceCard, SourceStatus, SourceSummary, PainCluster } from "@kittie/types";
import type { AppSignals } from "./types.js";
import { computeGrowthScore, computeGrowthPct, growthSourceStatuses } from "./growth.js";
import { computeConfidence } from "./confidence.js";
import { analyzePain, MIN_PAIN_SAMPLE, type PainReviewInput } from "./reviews/pain.js";
import { estimateRevenue, estimateDownloads } from "./revenue.js";
import { computeMonetisation } from "./calibration.js";

// Audit aggregator (epic #168, slice #170): compose sub-scores + evidence +
// confidence into an AuditReport. Pure + deterministic — `generatedAt` is passed
// in so it can be unit-tested. This slice wires Momentum only; later slices add
// Demand / Pain / Monetisation / Buildability behind the same contract.

export interface AuditInput {
  app: { id: string; name: string; category: string | null; iconUrl?: string | null; price?: number | null };
  signals: AppSignals;
  /** Review text for pain-cluster mining (#172). Omit ⇒ Pain unavailable. */
  reviews?: PainReviewInput[];
  /** Google Play monetisation signals (#173). Omit ⇒ uncalibrated. */
  play?: { installBucket?: string | null; hasSubscription?: boolean };
}

export function buildAuditReport(input: AuditInput, generatedAt: string): AuditReport {
  const { app, signals } = input;

  const hasReviewPrior = signals.reviewCountPrior != null;
  const hasRankPrior = signals.chartRankPrior != null;

  // ── Momentum (real, from the existing growth model) ──────────────────────
  const momentumValue = Math.round(computeGrowthScore(signals, "7d"));
  const pct = computeGrowthPct(signals, "7d");
  const momentumStatus: SourceStatus =
    hasReviewPrior || hasRankPrior ? "available" : "partial";

  const momentum: SubScore = {
    name: "momentum",
    label: "Momentum",
    value: momentumValue,
    sourceStatus: momentumStatus,
    inputs: {
      reviewCount: signals.reviewCount,
      reviewCountPrior: signals.reviewCountPrior,
      chartRank: signals.chartRank,
      chartRankPrior: signals.chartRankPrior,
      growthPct: pct,
    },
    note:
      pct == null
        ? "No prior snapshot yet — needs a second day to confirm movement"
        : undefined,
  };

  const scores: SubScore[] = [momentum];

  // ── Evidence cards (momentum only this slice) ────────────────────────────
  const evidence: EvidenceCard[] = [];
  if (pct != null) {
    evidence.push({
      id: "mom-review-velocity",
      kind: "momentum",
      title: `Review velocity ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% / 7d`,
      detail: `${signals.reviewCount} reviews now vs ${
        signals.reviewCountPrior ?? "—"
      } a week ago.`,
      sourceStatus: "available",
      observedAt: generatedAt,
    });
  }
  if (signals.chartRank != null) {
    const delta = hasRankPrior ? (signals.chartRankPrior as number) - signals.chartRank : null;
    const title =
      delta != null && delta !== 0
        ? `Chart rank ${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)} → #${signals.chartRank}`
        : `Charting at #${signals.chartRank}`;
    evidence.push({
      id: "mom-rank",
      kind: "momentum",
      title,
      detail: signals.category ? `${signals.category} chart movement.` : "Top-charts movement.",
      sourceStatus: hasRankPrior ? "available" : "partial",
      observedAt: generatedAt,
    });
  }
  if (evidence.length === 0) {
    evidence.push({
      id: "mom-none",
      kind: "momentum",
      title: "Limited momentum evidence",
      detail: "Not charting and no prior review snapshot yet — confidence is low.",
      sourceStatus: "unavailable",
    });
  }

  // ── Pain (#172) — mined from review text ─────────────────────────────────
  const pain = analyzePain(input.reviews ?? []);
  const painStatus: SourceStatus =
    pain.sampleSize === 0 ? "unavailable" : pain.sampleSize < MIN_PAIN_SAMPLE ? "partial" : "available";
  scores.push({
    name: "pain",
    label: "Pain",
    value: pain.score,
    sourceStatus: painStatus,
    inputs: { reviews: pain.sampleSize, clusters: pain.clusters.length },
    note:
      pain.sampleSize === 0
        ? "No reviews ingested yet"
        : pain.sampleSize < MIN_PAIN_SAMPLE
          ? `Thin review sample (n=${pain.sampleSize})`
          : undefined,
  });
  for (const cluster of pain.clusters.slice(0, 3)) {
    evidence.push({
      id: `pain-${slugify(cluster.theme)}`,
      kind: "pain",
      title: `${cluster.frequency} reviews · ${cluster.theme}`,
      detail: cluster.opportunity,
      sourceStatus: painStatus,
      observedAt: generatedAt,
    });
  }
  const painClusters: PainCluster[] = pain.clusters;

  // ── Monetisation (#173) — modelled revenue, Play-install calibrated ───────
  const modelledRevenue = estimateRevenue(signals);
  const modelledDownloads = estimateDownloads(signals, modelledRevenue);
  const mon = computeMonetisation({
    modelledRevenueUsd: modelledRevenue,
    modelledDownloads,
    iapCount: signals.iapCount,
    price: app.price,
    hasSubscription: input.play?.hasSubscription,
    installBucket: input.play?.installBucket,
  });
  scores.push({
    name: "monetisation",
    label: "Monetisation",
    value: mon.score,
    sourceStatus: mon.sourceStatus,
    inputs: mon.inputs,
    note: mon.note,
  });
  evidence.push({
    id: "mon-revenue",
    kind: "monetisation",
    title: `~$${compact(mon.inputs.revenueUsdPerMo as number)}/mo modelled${
      mon.calibrated ? " · Play-calibrated" : ""
    }`,
    detail:
      signals.iapCount > 0
        ? `${signals.iapCount} in-app purchases · est. ${compact(
            mon.inputs.downloadsPerMo as number,
          )} downloads/mo.`
        : `est. ${compact(mon.inputs.downloadsPerMo as number)} downloads/mo.`,
    sourceStatus: mon.sourceStatus,
    observedAt: generatedAt,
  });

  // ── Source strip — explicit per-signal availability (#171) ───────────────
  const st = growthSourceStatuses(signals);
  const sources: SourceSummary[] = [
    { key: "reviews", label: "Reviews", status: st.reviews },
    { key: "chart-rank", label: "Chart rank", status: st.chartRank },
    {
      key: "ads",
      label: "Ads",
      status: st.ads,
      note: st.ads === "unavailable" ? "Meta ad feed not yet connected" : undefined,
    },
    { key: "updates", label: "Update cadence", status: st.updates },
    {
      key: "review-text",
      label: "Review text",
      status: painStatus,
      note: painStatus === "unavailable" ? "No reviews ingested for this app yet" : undefined,
    },
    {
      key: "play-installs",
      label: "Play installs",
      status: mon.calibrated ? "available" : "unavailable",
      note: mon.calibrated ? undefined : "No Google Play install data — estimate uncalibrated",
    },
  ];

  // ── Confidence — across the live evidence sources ────────────────────────
  const sourcesPresent =
    (hasReviewPrior ? 1 : 0) + (hasRankPrior ? 1 : 0) + (painStatus === "available" ? 1 : 0);
  const confidence = computeConfidence({
    sourcesPresent,
    sourcesExpected: 3, // review-delta + rank-delta + review-text
    sampleSize: Math.max(signals.reviewCount, pain.sampleSize),
    freshness: hasReviewPrior ? "fresh" : "unknown",
    agreement: 0.6,
  });

  return {
    appId: app.id,
    appName: app.name,
    category: app.category,
    iconUrl: app.iconUrl ?? null,
    generatedAt,
    scores,
    confidence,
    sources,
    evidence,
    painClusters,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

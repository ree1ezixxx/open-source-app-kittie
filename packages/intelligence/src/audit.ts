import type { AuditReport, SubScore, EvidenceCard, SourceStatus, SourceSummary } from "@kittie/types";
import type { AppSignals } from "./types.js";
import { computeGrowthScore, computeGrowthPct, growthSourceStatuses } from "./growth.js";
import { computeConfidence } from "./confidence.js";

// Audit aggregator (epic #168, slice #170): compose sub-scores + evidence +
// confidence into an AuditReport. Pure + deterministic — `generatedAt` is passed
// in so it can be unit-tested. This slice wires Momentum only; later slices add
// Demand / Pain / Monetisation / Buildability behind the same contract.

export interface AuditInput {
  app: { id: string; name: string; category: string | null; iconUrl?: string | null };
  signals: AppSignals;
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
  ];

  // ── Confidence — momentum has two possible sources this slice ─────────────
  const sourcesPresent = (hasReviewPrior ? 1 : 0) + (hasRankPrior ? 1 : 0);
  const confidence = computeConfidence({
    sourcesPresent,
    sourcesExpected: 2, // review-delta + rank-delta
    sampleSize: signals.reviewCount,
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
  };
}

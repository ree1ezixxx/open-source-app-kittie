/**
 * Local App-Intelligence contracts (Lane C · wired-to-mock).
 *
 * These mirror the structured outputs Lane A (`find_similar_apps`,
 * `validate_app_idea`) and Lane B (`teardown_app`) will serve at
 * `/api/v1/app-intelligence/*`. They are anchored on the canonical honesty types
 * from `@kittie/types` (`DecisionPacket` / `Confidence` / `DecisionCoverage` /
 * `Evidence`) — never a parallel model (PRD §4.4 forbids a 4th model). When the
 * real `packages/types` contract lands, swap these for the shared import and
 * delete the mocks.
 */
import type { Confidence, DecisionCoverage, DecisionPacket } from "@kittie/types";

/** One supporting fact — the exact shape the DecisionPacket already carries. */
export type Evidence = DecisionPacket["evidence"][number];

/** Where a rendered payload came from — drives the honest "preview data" badge. */
export type DataSource = "live" | "mock";

/* ----------------------------- find_similar_apps ---------------------------- */

export type SimilarityClass = "direct" | "adjacent" | "analogue";

export interface SimilarApp {
  appId: string;
  name: string;
  iconUrl: string | null;
  category: string | null;
  /** 0..1. */
  similarityScore: number;
  similarityClass: SimilarityClass;
  /** Top-2 surfaced on the card; full list in the raw table. */
  reasons: string[];
  /** Modelled, monthly USD; null = not modelled (never 0-as-unknown). */
  estRevenue: number | null;
  /** Modelled, monthly installs; null = not modelled. */
  estDownloads: number | null;
  rating: number | null;
  confidence: Confidence;
}

export interface SimilarCluster {
  label: string;
  cls: SimilarityClass;
  apps: SimilarApp[];
}

export interface SimilarOutput {
  query: string;
  interpretedQuery: string;
  clusters: SimilarCluster[];
  /** Every candidate, ranked — backs the raw candidate table. */
  candidates: SimilarApp[];
  coverage: DecisionCoverage;
  agentSummary: string;
  source: DataSource;
  generatedAt: string;
}

/* ----------------------------- validate_app_idea ---------------------------- */

export interface ScoreFactor {
  label: string;
  /** 0..100. */
  score: number;
  rationale: string;
}

export interface MvpFeature {
  feature: string;
  why: string;
}

export interface IdeaRisk {
  risk: string;
  severity: "low" | "medium" | "high";
  mitigation: string | null;
}

export interface ValidateOutput {
  idea: string;
  interpretedIdea: string;
  /** The dominant verdict — decision + evidence + confidence + coverage + next actions. */
  verdict: DecisionPacket;
  /** 0..100, composed from the deterministic factor scores below. */
  overallScore: number;
  scoreBreakdown: ScoreFactor[];
  recommendedAngle: string;
  competitorSummary: {
    count: number;
    /** Honest descriptor, e.g. "Saturated — 20+ direct competitors". */
    saturation: string;
    top: SimilarApp[];
  };
  mvp: MvpFeature[];
  risks: IdeaRisk[];
  agentSummary: string;
  source: DataSource;
  generatedAt: string;
}

/* ------------------------------- teardown_app ------------------------------- */

export interface TeardownFeature {
  feature: string;
  /** What job it does in the core loop. */
  role: string;
  evidence: string | null;
}

export interface ReviewGap {
  gap: string;
  demandSignal: string;
  sourceCount: number;
}

export interface CloneInsight {
  insight: string;
  difficulty: "low" | "medium" | "high";
}

export interface TeardownOutput {
  appId: string;
  appName: string;
  /** The strategic thesis for this app, as a decision packet. */
  thesis: DecisionPacket;
  /** Ordered steps of the app's core engagement loop. */
  coreLoop: string[];
  featureMap: TeardownFeature[];
  monetisation: {
    model: string;
    detail: string;
    signals: string[];
  };
  reviewGaps: ReviewGap[];
  cloneInsights: CloneInsight[];
  evidence: Evidence[];
  agentSummary: string;
  source: DataSource;
  generatedAt: string;
}

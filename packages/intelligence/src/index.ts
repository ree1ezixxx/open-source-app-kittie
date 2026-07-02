export {
  computeGrowthPct,
  computeGrowthScore,
  isFirstMover,
  reviewGrowth7d,
} from "./growth.js";
export {
  estimateRevenue,
  estimateDownloads,
  rankDecay,
} from "./revenue.js";
export { computeKeywordDifficulty, computeOpportunityScore } from "./keyword.js";
export { resolveKeywordPosition, type RankResolverHit } from "./keyword-rank.js";
export { signalsFromContext } from "./signals.js";
export { classifyReview } from "./reviewClassifier.js";
export type { ClassifiableReview } from "./reviewClassifier.js";
export type {
  AppSignals,
  GrowthInput,
  RevenueInput,
  KeywordDifficultyInput,
} from "./types.js";
export { GROWTH_PERIOD_DAYS } from "./types.js";
export {
  buildDecisionPacket,
  DecisionPacketError,
  type BuildDecisionInput,
} from "./decision-packet.js";
export {
  buildIntelligenceResponse,
  IntelligenceResponseContractError,
  type BuildIntelligenceResponseInput,
  type MissingIntelligenceSource,
} from "./intelligence-response.js";
export {
  buildCategoryPulseResponse,
  type BuildCategoryPulseInput,
  type CategoryPulseAppInput,
} from "./trends.js";
export {
  buildCompareAppsResponse,
  CompareAppsError,
  type BuildCompareAppsInput,
} from "./compare-apps.js";
export {
  buildValidateIdeaResponse,
  ValidateIdeaInputError,
  type BuildValidateIdeaInput,
} from "./validate-idea.js";
export {
  computeDemandSignal,
  type DemandSignal,
  type DemandSignalInput,
  type DemandComponent,
} from "./demand.js";
export {
  synthesizeOpportunity,
  appStoreUrl,
  type MarketApp,
  type OpportunityInput,
} from "./opportunity.js";
export {
  buildTeardownApp,
  type BuildTeardownInput,
  type TeardownAppOutput,
  type TeardownDepth,
  type TeardownIdentity,
  type TeardownMetrics,
  type MonetisationModel,
  type ReviewInsights,
  type CoreLoop,
  type FeatureMap,
  type CloneInsights,
  type AsoModel,
  type ReviewClusters,
  type ScreenMap,
  type SectionLabel,
  TEARDOWN_DEPTHS,
} from "./teardown/index.js";
export {
  tokenize,
  interpretFromApp,
  interpretFromQuery,
  keywordOverlap,
  classifySimilarity,
  scoreSimilar,
  rankSimilar,
  computeSimilarConfidence,
  buildSimilarAgentSummary,
  type SimilarCandidate,
} from "./similarity/index.js";
export {
  scoreIdea,
  deriveVerdict,
  type IdeaScoringInput,
} from "./idea-validation/index.js";

import type { AppListItem } from "@kittie/types";
import { computeGrowthPct, computeGrowthScore, isFirstMover, reviewGrowth7d } from "./growth.js";
import { estimateDownloads, estimateRevenue } from "./revenue.js";
import type { AppSignals } from "./types.js";

/** Enrich raw signals into list-item estimates. */
export function scoreApp(
  base: Omit<
    AppListItem,
    | "reviewGrowth7d"
    | "downloadsEstimate30d"
    | "revenueEstimate30d"
    | "growthScore"
    | "growthPct"
    | "downloadsEstimatePrior"
    | "revenueEstimatePrior"
    | "rankDelta"
    | "isFirstMover"
  >,
  signals: AppSignals,
): AppListItem {
  const revenueEstimate30d = estimateRevenue(signals);
  const downloadsEstimate30d = estimateDownloads(signals, revenueEstimate30d);
  const growthScore = computeGrowthScore(signals, "7d");
  const prior = priorEstimates(signals);

  return {
    ...base,
    reviewGrowth7d: reviewGrowth7d(signals),
    downloadsEstimate30d,
    revenueEstimate30d,
    growthScore,
    growthPct: computeGrowthPct(signals, "7d"),
    ...prior,
    // Chart-rank movement is sourced from snapshot history by the caller
    // (db-app-service); estimators have no rank context, so default to null.
    rankDelta: null,
    isFirstMover: isFirstMover(signals, growthScore),
  };
}

/**
 * Re-run the (pure) estimators on the prior snapshot's signals: what the
 * estimates WERE one sample ago. Powers honest rank-change deltas without
 * needing estimates persisted on historical rows.
 */
export function priorEstimates(signals: AppSignals): {
  downloadsEstimatePrior: number | null;
  revenueEstimatePrior: number | null;
} {
  if (signals.reviewCountPrior == null) {
    return { downloadsEstimatePrior: null, revenueEstimatePrior: null };
  }
  const priorSignals: AppSignals = {
    ...signals,
    reviewCount: signals.reviewCountPrior,
    chartRank: signals.chartRankPrior,
    metaAdCount: signals.metaAdCountPrior ?? signals.metaAdCount,
  };
  const revenueEstimatePrior = estimateRevenue(priorSignals);
  return {
    downloadsEstimatePrior: estimateDownloads(priorSignals, revenueEstimatePrior),
    revenueEstimatePrior,
  };
}

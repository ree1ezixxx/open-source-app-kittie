export {
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
export { signalsFromContext } from "./signals.js";
export { classifyReview } from "./reviewClassifier.js";
export type { ClassifiableReview } from "./reviewClassifier.js";
/* Additive lane — Monitor + intelligence modules. */
export { captureChanges } from "./monitor/capture.js";
export type { Capture, ChangeField, FieldChange, WatchedFields } from "./monitor/capture.js";
export { DEFAULT_RULES, evaluateAlerts } from "./monitor/alertEvaluator.js";
export type {
  AlertCandidate,
  AlertRuleType,
  EvaluateOptions,
  RecentAlert,
  RuleConfig,
} from "./monitor/alertEvaluator.js";
export { mineNiche } from "./mining/reviewMiner.js";
export type {
  ClusterKind,
  MinableReview,
  MinedCluster,
  MineOptions,
  NicheReport,
} from "./mining/reviewMiner.js";
export { keywordGap, localizationGap, marketPresence } from "./gap/keywordGap.js";
export type {
  GapEntry,
  GapResult,
  IndexRow,
  MarketGapReport,
  MarketOpening,
} from "./gap/keywordGap.js";
export type {
  AppSignals,
  GrowthInput,
  RevenueInput,
  KeywordDifficultyInput,
} from "./types.js";
export { GROWTH_PERIOD_DAYS } from "./types.js";

import type { AppListItem } from "@kittie/types";
import { computeGrowthScore, isFirstMover, reviewGrowth7d } from "./growth.js";
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
    | "isFirstMover"
  >,
  signals: AppSignals,
): AppListItem {
  const revenueEstimate30d = estimateRevenue(signals);
  const downloadsEstimate30d = estimateDownloads(signals, revenueEstimate30d);
  const growthScore = computeGrowthScore(signals, "7d");

  return {
    ...base,
    reviewGrowth7d: reviewGrowth7d(signals),
    downloadsEstimate30d,
    revenueEstimate30d,
    growthScore,
    isFirstMover: isFirstMover(signals, growthScore),
  };
}

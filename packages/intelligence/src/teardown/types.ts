/**
 * `teardown_app` contracts (Lane B). The structured product blueprint a teardown
 * produces — anchored on `DecisionPacket`/`Provenanced` from `@kittie/types`, never
 * a forked confidence/evidence model. Sections present depend on `depth`; every
 * section carries an honesty `label`, and an absent one is `null` with a `missing`
 * label (a deeper depth is required, or a source was blocked) — never fabricated.
 */
import type {
  Confidence,
  DecisionPacket,
  RecommendedAction,
  Sentiment4,
  ValueKind,
} from "@kittie/types";

/**
 * Synthesis depth — gates cost so the tool is free in tight agent loops.
 * - `quick`    deterministic, NO LLM (identity + metrics + decision + risks)
 * - `standard` + cached-LLM narrative (thesis, audience, core loop, feature map, clone insights)
 * - `deep`     + screen-map (`@kittie/visual`) + ASO model + review clustering
 */
export type TeardownDepth = "quick" | "standard" | "deep";

export const TEARDOWN_DEPTHS: readonly TeardownDepth[] = ["quick", "standard", "deep"];

/** How a synthesized section was produced. `missing` (value `null`) records *why* it is absent. */
export interface SectionLabel {
  kind: ValueKind; // observed | modelled | derived | inferred | missing
  /** Why this label — e.g. "requires standard depth", "LLM-inferred", "blocked source". */
  note: string;
}

/** Observed listing identity. */
export interface TeardownIdentity {
  id: string;
  store: string;
  title: string;
  developer: string;
  category: string | null;
  iconUrl: string | null;
  storeUrl: string;
  isFirstMover: boolean;
}

/** Deterministic metrics lifted from `AppDetail` (modelled estimates stay labelled modelled). */
export interface TeardownMetrics {
  downloadsEstimate30d: number | null;
  revenueEstimate30d: number | null;
  growthScore: number | null;
  growthPct: number | null;
  rating: number | null;
  reviewCount: number;
  chartRank: number | null;
  price: number | null;
  languageCount: number;
}

/** The product's core habit loop (Hooked-style). LLM-inferred (standard+). */
export interface CoreLoop {
  trigger: string;
  action: string;
  reward: string;
  progress: string;
  return: string;
}

/** Features bucketed by strategic role. LLM-inferred (standard+). */
export interface FeatureMap {
  tableStakes: string[];
  retention: string[];
  monetisation: string[];
  differentiator: string[];
}

/** Deterministic review aggregation from persisted `ReviewTags`; LLM clustering (deep). */
export interface ReviewInsights {
  /** Reviews actually sampled (tagged) into this aggregate. */
  sampled: number;
  sentiment: Record<Sentiment4, number>;
  topTopics: Array<{ label: string; count: number }>;
  topImprovementAreas: Array<{ label: string; count: number }>;
}

/** Deterministic price/IAP facts + LLM framing (standard+). Always present. */
export interface MonetisationModel {
  priceModel: "free" | "paid" | "freemium" | "unknown";
  price: number | null;
  iapCount: number;
  iapPriceRange: { min: number; max: number } | null;
  /** LLM framing of the model; null in quick. */
  summary: string | null;
}

/** ASO / keyword opportunity. Deep mode. Deterministic from observed ad keywords + locales. */
export interface AsoModel {
  languageCount: number;
  languages: string[];
  /** Keywords the app is observed bidding on (Apple Search Ads), with bid rank. */
  keywords: Array<{ keyword: string; rank: number | null; difficulty: number | null; opportunity: number | null }>;
}

/** LLM-clustered review themes (deep). Built from raw review bodies, tagged or not. */
export interface ReviewClusters {
  /** Reviews sampled into the clustering call. */
  sampled: number;
  lovedThemes: string[];
  painThemes: string[];
  requestedFeatures: string[];
}

/** Vision-derived UI blueprint from listing screenshots (deep). Best-effort. */
export interface ScreenMap {
  /** Which screenshot(s) were read. */
  source: string;
  screens: Array<{ name: string; purpose: string; keyComponents: string[] }>;
}

/** Clone playbook — the strategic payload. LLM-inferred (standard+). */
export interface CloneInsights {
  copy: string[];
  dontCopy: string[];
  gaps: string[];
  mvp: string[];
  premiumLayer: string[];
  /** 1 (trivial) … 5 (very hard). */
  cloneDifficulty: number;
}

/**
 * The structured product blueprint. The embedded `decisionPacket` is the
 * canonical decision/evidence/coverage anchor; `agentSummary` is the
 * agent-consumable one-paragraph digest; `labels` carries per-section honesty.
 */
export interface TeardownAppOutput {
  depth: TeardownDepth;
  identity: TeardownIdentity;
  metrics: TeardownMetrics;
  /** One-line positioning thesis. LLM-inferred; null in quick. */
  thesis: string | null;
  /** The core user problem the app solves. LLM-inferred; null in quick. */
  coreUserProblem: string | null;
  /** Who it's for. LLM-inferred; null in quick. */
  audience: string | null;
  coreLoop: CoreLoop | null;
  featureMap: FeatureMap | null;
  monetisation: MonetisationModel;
  reviewInsights: ReviewInsights | null;
  /** LLM-clustered review themes — deep only; null otherwise. */
  reviewClusters: ReviewClusters | null;
  aso: AsoModel | null;
  /** Vision UI blueprint — deep only, best-effort; null otherwise. */
  screenMap: ScreenMap | null;
  cloneInsights: CloneInsights | null;
  /** Deterministic top risks — always present. */
  risks: string[];
  /** Canonical decision/confidence/evidence/coverage anchor. */
  decisionPacket: DecisionPacket;
  confidence: Confidence;
  nextActions: RecommendedAction[];
  /** One-paragraph agent-consumable summary (§12). Always present. */
  agentSummary: string;
  /** Per-section honesty labels, keyed by section name. */
  labels: Record<string, SectionLabel>;
}

/**
 * `teardown_app` synthesis (Lane B). Pure, I/O-free functions that turn an
 * `AppDetail` (+ optional tagged reviews) into a structured product blueprint
 * anchored on `DecisionPacket`. `buildTeardownApp` produces the **quick** depth
 * deterministically — NO LLM — so it is free in tight agent loops. The `standard`
 * / `deep` narrative sections (thesis, core loop, feature map, clone insights,
 * ASO, screen-map) are layered on by the API service, which owns the cached LLM
 * + `@kittie/visual` seams; until then they are `null` with a `missing` label.
 *
 * Honesty: modelled estimates stay labelled modelled; blocked sources (Meta ads)
 * are named in `decisionPacket.coverage.missing`, never fabricated.
 */
import type {
  AppDetail,
  Confidence,
  DecisionPacket,
  Evidence,
  Review,
  Sentiment4,
} from "@kittie/types";
import { buildDecisionPacket } from "../decision-packet.js";
import { appStoreUrl } from "../opportunity.js";
import type {
  MonetisationModel,
  ReviewInsights,
  SectionLabel,
  TeardownAppOutput,
  TeardownDepth,
  TeardownIdentity,
  TeardownMetrics,
} from "./types.js";

export * from "./types.js";

export interface BuildTeardownInput {
  app: AppDetail;
  /** Tagged reviews for the deterministic sentiment aggregate; optional. */
  reviews?: Review[];
  /** Target depth. Loop 1 implements `quick`; higher depths clamp to `quick`. */
  depth?: TeardownDepth;
  /** ISO-8601 instant the underlying data was observed/assembled. */
  observedAt: string;
}

const SENTIMENTS: readonly Sentiment4[] = ["positive", "neutral", "negative", "mixed"];
const STANDARD = (note = "requires standard depth (cached LLM)"): SectionLabel => ({ kind: "missing", note });
const DEEP = (note = "requires deep depth"): SectionLabel => ({ kind: "missing", note });

/** Most recent non-null chart rank across this app's snapshot history. */
function latestChartRank(app: AppDetail): number | null {
  const byDateDesc = [...app.historicals].sort((a, b) => (a.date < b.date ? 1 : -1));
  return byDateDesc.find((h) => h.chartRank != null)?.chartRank ?? null;
}

/** Most recent snapshot date — the snapshot this teardown is reasoned from. */
function latestSnapshotId(app: AppDetail, fallback: string): string {
  const byDateDesc = [...app.historicals].sort((a, b) => (a.date < b.date ? 1 : -1));
  return byDateDesc[0]?.date ?? fallback;
}

function monetisationModel(app: AppDetail): MonetisationModel {
  const iapPrices = app.iaps.map((i) => i.price).filter((p): p is number => p != null);
  const iapPriceRange =
    iapPrices.length > 0 ? { min: Math.min(...iapPrices), max: Math.max(...iapPrices) } : null;
  const priceModel: MonetisationModel["priceModel"] =
    app.price != null && app.price > 0
      ? "paid"
      : app.iaps.length > 0
        ? "freemium"
        : app.price === 0
          ? "free"
          : "unknown";
  return { priceModel, price: app.price, iapCount: app.iaps.length, iapPriceRange, summary: null };
}

/** Aggregate persisted review tags into honest counts. Null when no tagged reviews. */
function reviewInsights(reviews: Review[] | undefined): ReviewInsights | null {
  if (!reviews || reviews.length === 0) return null;
  const tagged = reviews.filter((r) => r.sentiment || r.topics?.length || r.improvementAreas?.length);
  if (tagged.length === 0) return null;

  const sentiment = Object.fromEntries(SENTIMENTS.map((s) => [s, 0])) as Record<Sentiment4, number>;
  const topicCounts = new Map<string, number>();
  const improvementCounts = new Map<string, number>();
  for (const r of tagged) {
    if (r.sentiment) sentiment[r.sentiment] += 1;
    for (const t of r.topics ?? []) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    for (const a of r.improvementAreas ?? []) improvementCounts.set(a, (improvementCounts.get(a) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));
  return { sampled: tagged.length, sentiment, topTopics: top(topicCounts), topImprovementAreas: top(improvementCounts) };
}

/** Deterministic top risks from current signals — never fabricated, always honest. */
function deterministicRisks(app: AppDetail, chartRank: number | null, mon: MonetisationModel): string[] {
  const risks: string[] = [];
  if (app.rating != null && app.rating < 3.5)
    risks.push(`Low satisfaction — ${app.rating.toFixed(1)}★ average; quality bar to clear.`);
  if (app.reviewCount < 50) risks.push(`Thin review base (${app.reviewCount}) — demand signal is early/weak.`);
  if (app.growthScore != null && app.growthScore < 30)
    risks.push(`Low growth momentum (score ${app.growthScore}/100).`);
  if (chartRank == null) risks.push("Not charting in tracked categories — discovery leans on non-chart channels.");
  if (app.languages.length <= 1) risks.push("Single-language listing — limited international reach.");
  if (mon.priceModel === "paid") risks.push(`Paid upfront (${app.price}) — conversion friction vs free rivals.`);
  if (risks.length === 0)
    risks.push("No deterministic red flags from current signals — validate qualitatively before cloning.");
  return risks;
}

/** Reuse the served category packet, else synthesise a minimal app-level one. */
function resolveDecisionPacket(app: AppDetail, observedAt: string, snapshotId: string): DecisionPacket {
  if (app.decisionPacket) return app.decisionPacket;

  const storeUrl = appStoreUrl({ id: app.id, store: app.store, title: app.title, rating: app.rating, reviewCount: app.reviewCount });
  const evidence: Evidence[] = [
    {
      claim: `${app.title} — ${app.rating ?? "?"}★, ${app.reviewCount.toLocaleString()} reviews`,
      valueType: "observed",
      sourceId: app.id,
      sourceUrl: storeUrl,
      observedAt,
    },
  ];
  if (app.downloadsEstimate30d != null || app.revenueEstimate30d != null) {
    evidence.push({
      claim: `Modelled 30d: ~${app.downloadsEstimate30d ?? "?"} downloads, ~${app.revenueEstimate30d ?? "?"} revenue`,
      valueType: "modelled",
      sourceId: "model:revenue",
      sourceUrl: null,
      observedAt,
    });
  }
  const score = Math.min(
    0.9,
    0.4 + (app.rating != null ? 0.1 : 0) + (app.reviewCount > 500 ? 0.2 : app.reviewCount > 50 ? 0.1 : 0) + (app.historicals.length > 1 ? 0.1 : 0),
  );
  return buildDecisionPacket({
    decision: `${app.title}: ${app.rating ?? "?"}★ over ${app.reviewCount.toLocaleString()} reviews in ${app.category ?? "—"}.`,
    evidence,
    confidence: {
      score,
      reasons: [
        `${app.reviewCount.toLocaleString()} reviews observed`,
        app.historicals.length > 1 ? "trend history available" : "single snapshot only",
        "ad spend unavailable (blocked source)",
      ],
    },
    missing: ["Meta advertising data"],
    snapshotId,
    recommendedActions: [
      { tool: "get_app_reviews", reason: "Mine this app's reviews for a complaint-driven feature backlog.", estimatedCost: 0.05 },
      { tool: "get_related_keywords", reason: "Find winnable ASO keywords for the niche before committing.", estimatedCost: 0.03 },
    ],
  });
}

/**
 * Build the deterministic **quick** teardown. Pure and total — every field is
 * either an observed/modelled fact or an honest `missing` label. Standard/deep
 * sections are `null` here and filled by the API service's LLM/visual seams.
 */
export function buildTeardownApp(input: BuildTeardownInput): TeardownAppOutput {
  const { app, reviews, observedAt } = input;
  const snapshotId = latestSnapshotId(app, observedAt);
  const chartRank = latestChartRank(app);
  const mon = monetisationModel(app);
  const reviews_ = reviewInsights(reviews);
  const risks = deterministicRisks(app, chartRank, mon);
  const decisionPacket = resolveDecisionPacket(app, observedAt, snapshotId);

  const identity: TeardownIdentity = {
    id: app.id,
    store: app.store,
    title: app.title,
    developer: app.developer,
    category: app.category,
    iconUrl: app.iconUrl,
    storeUrl: appStoreUrl({ id: app.id, store: app.store, title: app.title, rating: app.rating, reviewCount: app.reviewCount }),
    isFirstMover: app.isFirstMover,
  };
  const metrics: TeardownMetrics = {
    downloadsEstimate30d: app.downloadsEstimate30d,
    revenueEstimate30d: app.revenueEstimate30d,
    growthScore: app.growthScore,
    growthPct: app.growthPct,
    rating: app.rating,
    reviewCount: app.reviewCount,
    chartRank,
    price: app.price,
    languageCount: app.languages.length,
  };

  const missingNote = decisionPacket.coverage.missing.length
    ? `missing: ${decisionPacket.coverage.missing.join(", ")}; `
    : "";
  const agentSummary =
    `${identity.title} by ${identity.developer} — ${identity.category ?? "uncategorised"} (${identity.store}). ` +
    `Modelled ~${metrics.downloadsEstimate30d ?? "?"} downloads and ~${metrics.revenueEstimate30d ?? "?"} revenue (30d). ` +
    `${metrics.rating ?? "?"}★ across ${metrics.reviewCount.toLocaleString()} reviews` +
    `${chartRank != null ? `, chart rank #${chartRank}` : ""}. ${decisionPacket.decision} ` +
    `Top risk: ${risks[0]} (teardown depth: quick; ${missingNote}narrative sections require standard depth).`;

  return {
    depth: "quick",
    identity,
    metrics,
    thesis: null,
    coreUserProblem: null,
    audience: null,
    coreLoop: null,
    featureMap: null,
    monetisation: mon,
    reviewInsights: reviews_,
    reviewClusters: null,
    aso: null,
    screenMap: null,
    cloneInsights: null,
    risks,
    decisionPacket,
    confidence: decisionPacket.confidence as Confidence,
    nextActions: decisionPacket.recommendedActions,
    agentSummary,
    labels: {
      identity: { kind: "observed", note: "store listing facts" },
      metrics: { kind: "modelled", note: "downloads/revenue/growth are modelled estimates; rating/reviews observed" },
      monetisation: { kind: "derived", note: "from price + IAP listing facts" },
      reviewInsights: reviews_
        ? { kind: "derived", note: `aggregated from ${reviews_.sampled} persisted review tags` }
        : { kind: "missing", note: "no tagged reviews supplied" },
      risks: { kind: "derived", note: "computed from current signals" },
      decisionPacket: { kind: "derived", note: app.decisionPacket ? "category-opportunity packet" : "app-level packet" },
      thesis: STANDARD(),
      coreUserProblem: STANDARD(),
      audience: STANDARD(),
      coreLoop: STANDARD(),
      featureMap: STANDARD(),
      cloneInsights: STANDARD(),
      reviewClusters: DEEP("requires deep depth (review clustering)"),
      aso: DEEP(),
      screenMap: DEEP("requires deep depth (vision)"),
    },
  };
}

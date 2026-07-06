/**
 * cluster_reviews synthesis (#259). Pure, I/O-free functions that turn a set of
 * competitor apps + their persisted-tagged reviews into ranked cross-app themes
 * (`ReviewTheme[]`) and wrap them in the canonical #180 intelligence envelope.
 *
 * The DETERMINISTIC base is always available: it groups reviews by the canonical
 * `topics` / `improvementAreas` labels the classifier persisted at ingest, then
 * scores each label's frequency, sentiment, cross-app spread, recency trend and
 * confidence. It never fabricates — untagged reviews simply carry no theme, and
 * an empty competitor set degrades to an `insufficient` envelope.
 *
 * The API service owns the optional LLM seam: it may relabel a theme's `theme`
 * name and `type` (naming the *specific* complaint inside a coarse bucket), then
 * re-wrap through `buildReviewClustersResponse` — the deterministic counts are
 * never touched by the model.
 */
import {
  INTELLIGENCE_CONTRACT_VERSION,
  type ClusterReviewsRequest,
  type IntelligenceCaveat,
  type IntelligenceConfidence,
  type IntelligenceEvidence,
  type ReviewClusterAppCoverage,
  type ReviewClusterEnrichment,
  type ReviewClustersData,
  type ReviewClustersIntelligenceResponse,
  type ReviewTheme,
  type ReviewThemeAppBreakdown,
  type ReviewThemeQuote,
  type ReviewThemeTrend,
  type ReviewThemeType,
  type Sentiment4,
} from "@kittie/types";
import { buildIntelligenceResponse, type MissingIntelligenceSource } from "../intelligence-response.js";

/* ---- tunables (documented so agents/tests can reason about the numbers) --- */

export const CLUSTER_DEFAULTS = {
  limitApps: 10,
  maxLimitApps: 25,
  maxReviewsPerApp: 100,
  hardMaxReviewsPerApp: 500,
  minThemeFrequency: 0.02,
  maxQuotesPerTheme: 3,
  quoteMaxLen: 240,
  trendWindowDays: 30,
  trendMinMentions: 5,
  /** Themes shown as evidence in the envelope (all still returned in `data.themes`). */
  maxEvidenceThemes: 12,
} as const;

/* ---- pure input shapes (provider/DB-agnostic) ---------------------------- */

/** A review normalised for clustering — no reviewer identity ever enters here. */
export interface ClusterInputReview {
  appId: string;
  rating: number;
  title?: string | null;
  body: string;
  sentiment: Sentiment4 | null;
  topics: string[];
  improvementAreas: string[];
  /** ISO date; null when unknown. */
  reviewedAt: string | null;
}

export interface ClusterInputApp {
  id: string;
  name: string;
}

export interface ClusterReviewsComputeInput {
  apps: ClusterInputApp[];
  reviews: ClusterInputReview[];
  params: ClusterReviewsRequest;
  /** ms epoch used to split the trend window — pass a fixed clock for determinism. */
  nowMs: number;
}

export interface ClusterReviewsComputed {
  themes: ReviewTheme[];
  coverage: ReviewClusterAppCoverage[];
  totalReviewsAnalyzed: number;
}

/* ---- deterministic label → theme-type taxonomy --------------------------- */

/**
 * Canonical classifier labels → theme type. Two labels can collapse to one type;
 * a positive-sentiment theme in a "negative-leaning" bucket is re-typed `praise`
 * downstream. Unmapped labels fall through to `other` (honest, not forced).
 */
const LABEL_TYPE: Record<string, ReviewThemeType> = {
  // pricing / money
  "Subscription Pricing": "pricing",
  "Payment Issues": "pricing",
  "Billing Accuracy": "pricing",
  "Payment Options": "pricing",
  "App Value": "pricing",
  "Free Trial Policy": "pricing",
  // bugs / stability
  "App Performance": "bug",
  // feature requests / gaps
  Features: "request",
  "Feature Functionality": "request",
  "Cross-Platform Sync": "request",
  // interface
  "User Interface": "ux",
  // support / access / noise (generic complaint surface)
  "Customer Support": "complaint",
  "Account Access": "complaint",
  "Account Recovery": "complaint",
  "Ads & Interruptions": "complaint",
  Notifications: "complaint",
  "Push Notifications": "complaint",
  "Data Security": "complaint",
  "Content Moderation": "complaint",
  "Cancellation Process": "complaint",
  "Content & Library": "other",
};

/** Buckets we allow a strongly-positive theme to flip into `praise`. */
const PRAISE_ELIGIBLE: ReadonlySet<ReviewThemeType> = new Set<ReviewThemeType>([
  "complaint",
  "bug",
  "ux",
  "other",
]);

const SENTIMENT_SCORE: Record<Sentiment4, number> = {
  positive: 1,
  neutral: 0,
  mixed: 0,
  negative: -1,
};

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round = (n: number, dp = 3): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Canonical classifier label → theme type (before any sentiment `praise` flip). */
export function themeTypeForLabel(label: string): ReviewThemeType {
  return LABEL_TYPE[label] ?? "other";
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "theme";
}

/** Mean sentiment (−1..1) over reviews carrying a numeric sentiment; 0 when none do. */
function meanSentiment(reviews: ClusterInputReview[]): number {
  let sum = 0;
  let n = 0;
  for (const r of reviews) {
    if (r.sentiment) {
      sum += SENTIMENT_SCORE[r.sentiment];
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function meanRating(reviews: ClusterInputReview[]): number | null {
  const rated = reviews.filter((r) => Number.isFinite(r.rating));
  if (rated.length === 0) return null;
  return round(rated.reduce((a, r) => a + r.rating, 0) / rated.length, 2);
}

function trimQuote(r: ClusterInputReview): string {
  const raw = (r.body || r.title || "").trim().replace(/\s+/g, " ");
  if (raw.length <= CLUSTER_DEFAULTS.quoteMaxLen) return raw;
  const cut = raw.slice(0, CLUSTER_DEFAULTS.quoteMaxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Distinct tag labels a review carries — fewer = more specific to any one theme. */
function labelCount(r: ClusterInputReview): number {
  return new Set([...(r.topics ?? []), ...(r.improvementAreas ?? [])]).size;
}

/**
 * One representative quote per app, SPECIFICITY first: prefer the member review
 * carrying the fewest distinct tag labels (a review tagged with everything is
 * about nothing in particular — smoke-tested against real data, the longest
 * review otherwise wins every theme and all quotes collapse to one voice),
 * tie-break by longer body. Then order the per-app picks the same way.
 */
function pickQuotes(reviews: ClusterInputReview[], appName: Map<string, string>): ReviewThemeQuote[] {
  const better = (a: ClusterInputReview, b: ClusterInputReview): boolean => {
    const la = labelCount(a);
    const lb = labelCount(b);
    if (la !== lb) return la < lb;
    return (a.body?.length ?? 0) > (b.body?.length ?? 0);
  };
  const bestPerApp = new Map<string, ClusterInputReview>();
  for (const r of reviews) {
    if ((r.body || r.title || "").trim().length === 0) continue;
    const cur = bestPerApp.get(r.appId);
    if (!cur || better(r, cur)) bestPerApp.set(r.appId, r);
  }
  return [...bestPerApp.values()]
    .sort(
      (a, b) =>
        labelCount(a) - labelCount(b) ||
        (b.body?.length ?? 0) - (a.body?.length ?? 0) ||
        a.appId.localeCompare(b.appId),
    )
    .slice(0, CLUSTER_DEFAULTS.maxQuotesPerTheme)
    .map<ReviewThemeQuote>((r) => ({
      appId: r.appId,
      appName: appName.get(r.appId) ?? null,
      rating: Number.isFinite(r.rating) ? r.rating : null,
      text: trimQuote(r),
      date: r.reviewedAt,
    }));
}

function themeTrend(reviews: ClusterInputReview[], nowMs: number): ReviewThemeTrend {
  const windowMs = CLUSTER_DEFAULTS.trendWindowDays * 86_400_000;
  let recent = 0;
  let prior = 0;
  for (const r of reviews) {
    if (!r.reviewedAt) continue;
    const t = Date.parse(r.reviewedAt);
    if (Number.isNaN(t)) continue;
    const age = nowMs - t;
    if (age < 0) continue;
    if (age <= windowMs) recent += 1;
    else if (age <= windowMs * 2) prior += 1;
  }
  // Too few dated mentions in either window to call a direction honestly.
  if (recent < CLUSTER_DEFAULTS.trendMinMentions || prior < CLUSTER_DEFAULTS.trendMinMentions) return "unknown";
  if (recent >= prior * 1.15) return "rising";
  if (recent <= prior * 0.85) return "falling";
  return "stable";
}

/**
 * Build the deterministic theme set. Pure and total: every returned theme traces
 * to real tagged reviews; untagged reviews contribute only to the analyzed total.
 */
export function clusterReviewsDeterministic(input: ClusterReviewsComputeInput): ClusterReviewsComputed {
  const { apps, params, nowMs } = input;
  const appName = new Map(apps.map((a) => [a.id, a.name]));
  const sinceMs = params.since ? Date.parse(params.since) : null;
  const hasSince = sinceMs != null && !Number.isNaN(sinceMs);

  // `since` drops reviews we cannot prove fall in range (undated ones included) —
  // never silently counting an out-of-window review toward a "rising" trend.
  const scoped = input.reviews.filter((r) => {
    if (!hasSince) return true;
    if (!r.reviewedAt) return false;
    const t = Date.parse(r.reviewedAt);
    return !Number.isNaN(t) && t >= (sinceMs as number);
  });

  const coverage: ReviewClusterAppCoverage[] = apps.map((a) => ({
    appId: a.id,
    appName: a.name,
    reviewsAnalyzed: 0,
  }));
  const coverageByApp = new Map(coverage.map((c) => [c.appId, c]));
  for (const r of scoped) {
    const c = coverageByApp.get(r.appId);
    if (c) c.reviewsAnalyzed += 1;
  }
  const totalReviewsAnalyzed = scoped.length;

  // Group reviews by canonical label (topics ∪ improvementAreas). A review with
  // no tags joins no group — its weight lives only in the analyzed total.
  const byLabel = new Map<string, ClusterInputReview[]>();
  for (const r of scoped) {
    const labels = new Set<string>([...(r.topics ?? []), ...(r.improvementAreas ?? [])]);
    for (const label of labels) {
      const arr = byLabel.get(label);
      if (arr) arr.push(r);
      else byLabel.set(label, [r]);
    }
  }

  const totalApps = Math.max(apps.length, 1);
  const minFreq = params.minThemeFrequency ?? CLUSTER_DEFAULTS.minThemeFrequency;
  const allowTypes = params.themeTypes && params.themeTypes.length > 0 ? new Set(params.themeTypes) : null;

  const themes: ReviewTheme[] = [];
  for (const [label, members] of byLabel) {
    const mentionCount = members.length;
    const freq = totalReviewsAnalyzed > 0 ? mentionCount / totalReviewsAnalyzed : 0;
    if (freq < minFreq) continue;

    const sentiment = round(meanSentiment(members), 3);
    let type = themeTypeForLabel(label);
    if (sentiment >= 0.4 && PRAISE_ELIGIBLE.has(type)) type = "praise";
    if (allowTypes && !allowTypes.has(type)) continue;

    // per-app breakdown
    const byApp = new Map<string, ClusterInputReview[]>();
    for (const r of members) {
      const arr = byApp.get(r.appId);
      if (arr) arr.push(r);
      else byApp.set(r.appId, [r]);
    }
    const appBreakdown: ReviewThemeAppBreakdown[] = [...byApp.entries()]
      .map<ReviewThemeAppBreakdown>(([appId, rs]) => ({
        appId,
        appName: appName.get(appId) ?? appId,
        mentionCount: rs.length,
        avgRating: meanRating(rs),
        sentiment: round(meanSentiment(rs), 3),
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount || a.appId.localeCompare(b.appId));

    const distinctApps = byApp.size;
    const spread = distinctApps / totalApps;
    const volume = Math.min(mentionCount / 25, 1);
    const confidence = round(clamp01(0.25 + volume * 0.45 + spread * 0.3), 3);

    themes.push({
      theme: label,
      type,
      freq: round(freq, 4),
      mentionCount,
      sentiment,
      apps: appBreakdown.map((a) => a.appName),
      appBreakdown,
      quotes: pickQuotes(members, appName),
      trend: themeTrend(members, nowMs),
      confidence,
    });
  }

  themes.sort(
    (a, b) => b.mentionCount - a.mentionCount || b.confidence - a.confidence || a.theme.localeCompare(b.theme),
  );

  return { themes, coverage, totalReviewsAnalyzed };
}

/* ---- envelope builder ---------------------------------------------------- */

export interface BuildReviewClustersInput {
  themes: ReviewTheme[];
  coverage: ReviewClusterAppCoverage[];
  totalReviewsAnalyzed: number;
  apps: ClusterInputApp[];
  params: ClusterReviewsRequest;
  enrichment: ReviewClusterEnrichment;
  /** ISO instant the underlying data was assembled. */
  generatedAt: string;
  /** LLM model id when enriched; null on the deterministic path. */
  modelVersion?: string | null;
}

function themeEvidence(themes: ReviewTheme[]): IntelligenceEvidence[] {
  return themes.slice(0, CLUSTER_DEFAULTS.maxEvidenceThemes).map<IntelligenceEvidence>((t, i) => ({
    id: `theme:${slug(t.theme)}:${i}`,
    claim: `"${t.theme}" (${t.type}) — ${t.mentionCount} mention${t.mentionCount === 1 ? "" : "s"} across ${t.apps.length} app${t.apps.length === 1 ? "" : "s"}, sentiment ${t.sentiment.toFixed(2)}, trend ${t.trend}`,
    source: { type: "review", id: `theme:${slug(t.theme)}`, url: null },
    valueKind: "derived",
    sourceStatus: "ok",
    freshness: t.trend === "unknown" ? "unknown" : "fresh",
    observedAt: null,
    metric: { name: "mentionCount", value: t.mentionCount, unit: null },
  }));
}

function overallConfidence(input: BuildReviewClustersInput): IntelligenceConfidence {
  const appsWithReviews = input.coverage.filter((c) => c.reviewsAnalyzed > 0).length;
  const totalApps = Math.max(input.apps.length, 1);
  if (input.totalReviewsAnalyzed === 0) {
    return { score: 0, label: "insufficient", reasons: ["No local reviews for the competitor set."] };
  }
  const volume = Math.min(input.totalReviewsAnalyzed / 100, 1);
  const spread = appsWithReviews / totalApps;
  const score = clamp01(Math.min(0.9, 0.4 + volume * 0.35 + spread * 0.25));
  const reasons = [
    `${input.totalReviewsAnalyzed} reviews across ${appsWithReviews}/${totalApps} apps analysed`,
    `${input.themes.length} theme${input.themes.length === 1 ? "" : "s"} above the frequency floor`,
    input.enrichment === "llm"
      ? "themes named by LLM enrichment"
      : "coarse taxonomy themes (LLM naming unavailable)",
  ];
  return { score: round(score, 3), label: score >= 0.75 ? "high" : score >= 0.6 ? "medium" : "low", reasons };
}

/**
 * Wrap a final theme list (deterministic OR LLM-enriched) into the canonical
 * envelope. Both paths flow through here so evidence/confidence/caveats are
 * identical in shape regardless of whether the model was reachable.
 */
export function buildReviewClustersResponse(
  input: BuildReviewClustersInput,
): ReviewClustersIntelligenceResponse {
  const appsWithoutReviews = input.coverage.filter((c) => c.reviewsAnalyzed === 0);
  const caveats: IntelligenceCaveat[] = [];
  const missingSources: MissingIntelligenceSource[] = [];

  if (input.totalReviewsAnalyzed === 0) {
    missingSources.push({
      sourceType: "review",
      message: "No reviews are held locally for the resolved competitor set — ingest reviews to cluster them.",
    });
  } else if (appsWithoutReviews.length > 0) {
    caveats.push({
      kind: "partial_source",
      sourceType: "review",
      message: `${appsWithoutReviews.length} of ${input.coverage.length} apps have no local reviews and did not contribute themes.`,
    });
  }
  if (input.enrichment === "deterministic" && input.totalReviewsAnalyzed > 0) {
    caveats.push({
      kind: "weak_evidence",
      sourceType: "model",
      message: "Themes are coarse taxonomy buckets; specific-theme naming requires the LLM seam (unconfigured).",
    });
  }

  const data: ReviewClustersData = {
    query: typeof input.params.query === "string" && input.params.query.trim() ? input.params.query.trim() : null,
    country: input.params.country?.trim() || "US",
    appIds: input.apps.map((a) => a.id),
    totalReviewsAnalyzed: input.totalReviewsAnalyzed,
    coverage: input.coverage,
    themes: input.themes,
    enrichment: input.enrichment,
  };

  return buildIntelligenceResponse<ReviewClustersData, "review_clusters">({
    responseType: "review_clusters",
    data,
    evidence: themeEvidence(input.themes),
    confidence: overallConfidence(input),
    caveats,
    missingSources,
    metadata: {
      contractVersion: INTELLIGENCE_CONTRACT_VERSION,
      generatedAt: input.generatedAt,
      sourceQuery: {
        query: data.query,
        country: data.country,
        appCount: data.appIds.length,
        totalReviewsAnalyzed: data.totalReviewsAnalyzed,
        enrichment: data.enrichment,
        since: input.params.since ?? null,
        minThemeFrequency: input.params.minThemeFrequency ?? CLUSTER_DEFAULTS.minThemeFrequency,
      },
      snapshotId: null,
      chartCountry: data.country,
      growthPeriod: null,
      modelVersion: input.modelVersion ?? null,
    },
  });
}

/** Convenience: deterministic clustering + envelope in one call (the no-LLM path). */
export function clusterReviews(input: ClusterReviewsComputeInput, generatedAt: string): ReviewClustersIntelligenceResponse {
  const { themes, coverage, totalReviewsAnalyzed } = clusterReviewsDeterministic(input);
  return buildReviewClustersResponse({
    themes,
    coverage,
    totalReviewsAnalyzed,
    apps: input.apps,
    params: input.params,
    enrichment: "deterministic",
    generatedAt,
    modelVersion: null,
  });
}

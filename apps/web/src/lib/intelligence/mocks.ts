/**
 * Honest preview fixtures (Lane C · wired-to-mock).
 *
 * Every fixture sets `source: "mock"` so the UI can label it "Preview data" and
 * never present it as a real market fact. Shapes are identical to what Lane A/B
 * will serve, so swapping to live data is a client change only — no UI churn.
 * Delete this file once `/api/v1/app-intelligence/*` lands.
 */
import type { DecisionPacket } from "@kittie/types";
import type {
  SimilarApp,
  SimilarOutput,
  TeardownOutput,
  ValidateOutput,
} from "./types";

const now = () => new Date().toISOString();

function packet(decision: string, overrides: Partial<DecisionPacket> = {}): DecisionPacket {
  return {
    decision,
    evidence: [
      {
        claim: "11 direct competitors observed in the category top-200",
        valueType: "observed",
        sourceId: "apple:rss",
        sourceUrl: "https://apps.apple.com",
        observedAt: now(),
      },
      {
        claim: "Modelled category revenue concentration is top-heavy (top 3 ≈ 60%)",
        valueType: "modelled",
        sourceId: "model:revenue@3",
        sourceUrl: null,
        observedAt: now(),
      },
      {
        claim: "Review velocity inferred rising ~8%/wk across the cohort",
        valueType: "inferred",
        sourceId: "derived:review-growth",
        sourceUrl: null,
        observedAt: now(),
      },
    ],
    confidence: { score: 0.46, reasons: ["Preview fixture — not yet wired to live retrieval"] },
    coverage: { status: "partial", missing: ["Meta advertising data", "Android revenue estimates"] },
    assumptions: ["Category demand stays flat over the next 2 quarters"],
    unknowns: ["True paid-conversion rate for the niche"],
    recommendedActions: [
      { tool: "get_app_reviews", reason: "Surface the unmet need behind the gaps", estimatedCost: 0 },
      { tool: "get_related_keywords", reason: "Size organic demand for the wedge", estimatedCost: 0 },
    ],
    snapshotId: "preview",
    ...overrides,
  };
}

const SAMPLE_APPS: SimilarApp[] = [
  {
    appId: "preview-1",
    name: "Calm",
    iconUrl: null,
    category: "Health & Fitness",
    similarityScore: 0.91,
    similarityClass: "direct",
    reasons: ["Same core job: guided wind-down", "Overlapping sleep-story catalogue"],
    estRevenue: 8_900_000,
    estDownloads: 1_200_000,
    rating: 4.8,
    confidence: { score: 0.62, reasons: ["Strong category + keyword overlap"] },
  },
  {
    appId: "preview-2",
    name: "Headspace",
    iconUrl: null,
    category: "Health & Fitness",
    similarityScore: 0.88,
    similarityClass: "direct",
    reasons: ["Course-based meditation structure", "Subscription-first monetisation"],
    estRevenue: 6_400_000,
    estDownloads: 900_000,
    rating: 4.7,
    confidence: { score: 0.6, reasons: ["Strong category overlap"] },
  },
  {
    appId: "preview-3",
    name: "Balance",
    iconUrl: null,
    category: "Health & Fitness",
    similarityScore: 0.71,
    similarityClass: "adjacent",
    reasons: ["Personalised plan onboarding", "Free-year acquisition motion"],
    estRevenue: 2_100_000,
    estDownloads: 410_000,
    rating: 4.6,
    confidence: { score: 0.48, reasons: ["Adjacent positioning"] },
  },
  {
    appId: "preview-4",
    name: "Finch",
    iconUrl: null,
    category: "Health & Fitness",
    similarityScore: 0.43,
    similarityClass: "analogue",
    reasons: ["Self-care via pet-care metaphor", "Streak-driven retention loop"],
    estRevenue: 1_500_000,
    estDownloads: 720_000,
    rating: 4.8,
    confidence: { score: 0.35, reasons: ["Analogue mechanic, different surface"] },
  },
];

export function mockSimilar(query: string): SimilarOutput {
  return {
    query,
    interpretedQuery: query
      ? `Apps competing with: ${query}`
      : "Top mindfulness & wind-down apps",
    clusters: [
      { label: "Direct competitors", cls: "direct", apps: SAMPLE_APPS.filter((a) => a.similarityClass === "direct") },
      { label: "Adjacent plays", cls: "adjacent", apps: SAMPLE_APPS.filter((a) => a.similarityClass === "adjacent") },
      { label: "Analogue mechanics", cls: "analogue", apps: SAMPLE_APPS.filter((a) => a.similarityClass === "analogue") },
    ],
    candidates: SAMPLE_APPS,
    coverage: { status: "partial", missing: ["Android catalogue", "Paid-keyword overlap"] },
    agentSummary:
      "4 candidate apps: 2 direct (Calm, Headspace), 1 adjacent (Balance), 1 analogue (Finch). " +
      "Direct cluster is subscription-first and saturated; the analogue mechanic (gamified self-care) is the least-contested wedge.",
    source: "mock",
    generatedAt: now(),
  };
}

export function mockValidate(idea: string): ValidateOutput {
  const interpreted = idea || "A guided meditation app for UK adults";
  return {
    idea,
    interpretedIdea: interpreted,
    verdict: packet(`Build a narrower wedge than "${interpreted}" — the broad market is saturated, but a sleep-anxiety niche is open.`),
    overallScore: 58,
    scoreBreakdown: [
      { label: "Market heat", score: 72, rationale: "Category review velocity rising ~8%/wk across the cohort." },
      { label: "Competition", score: 34, rationale: "11 direct competitors; top 3 hold ~60% of modelled revenue." },
      { label: "Demand signal", score: 61, rationale: "Sustained organic search for 'sleep anxiety' adjacent terms." },
      { label: "Feasibility", score: 66, rationale: "Standard content + subscription stack; no novel infra." },
    ],
    recommendedAngle:
      "Sleep-anxiety wind-down for shift workers — a time-of-day-aware programme the incumbents don't personalise.",
    opportunities: [
      "Sleep-anxiety wind-down for shift workers is unaddressed by the incumbents.",
      "Time-of-day personalisation is a differentiator none of the top 3 offer.",
    ],
    competitorSummary: {
      count: 11,
      saturation: "Saturated — 11 direct competitors, top-heavy revenue",
      top: SAMPLE_APPS.slice(0, 3),
    },
    mvp: [
      { feature: "3 time-of-day wind-down programmes", why: "Smallest thing that proves the shift-worker angle." },
      { feature: "Sleep-anxiety check-in", why: "Captures the unmet need the incumbents ignore." },
      { feature: "Single subscription tier", why: "Validate willingness-to-pay before tiering." },
    ],
    risks: [
      { risk: "Incumbents (Calm/Headspace) copy the angle", severity: "high", mitigation: "Win a defensible niche audience first." },
      { risk: "Content production cost", severity: "medium", mitigation: "Start with 3 programmes, expand on retention signal." },
      { risk: "Subscription fatigue in the category", severity: "medium", mitigation: "Lead with a genuinely free useful tier." },
    ],
    agentSummary:
      "Verdict: conditional build (score 58/100). Broad meditation market is saturated (competition 34/100), " +
      "but demand (61) and feasibility (66) support a narrow sleep-anxiety / shift-worker wedge. " +
      "Recommended next: pull competitor reviews to confirm the unmet need, then size keyword demand.",
    source: "mock",
    generatedAt: now(),
  };
}

export function mockTeardown(appId: string, appName: string): TeardownOutput {
  return {
    appId,
    appName,
    thesis: packet(`${appName} wins on habit, not content — the daily streak loop is the moat, not the meditation library.`),
    coreLoop: [
      "Notification at the user's chosen wind-down time",
      "One-tap into a short guided session",
      "Streak + reflection logged on completion",
      "Weekly progress recap pulls the user back",
    ],
    featureMap: [
      { feature: "Daily streak", role: "Retention engine — the real product", evidence: "Reviews repeatedly cite 'streak'" },
      { feature: "Sleep stories", role: "Acquisition hook for the wind-down use case", evidence: null },
      { feature: "Personalised plan", role: "Onboarding commitment device", evidence: null },
    ],
    monetisation: {
      model: "Subscription (annual-first)",
      detail: "Free-trial → annual plan; hard paywall after onboarding.",
      signals: ["Paywall observed post-onboarding", "Annual default pre-selected"],
    },
    reviewGaps: [
      { gap: "No offline downloads on the cheaper tier", demandSignal: "Recurring 1–2★ complaint", sourceCount: 14 },
      { gap: "Weak progress analytics", demandSignal: "Requested in feature-request reviews", sourceCount: 9 },
    ],
    cloneInsights: [
      { insight: "Reproduce the streak loop before any content", difficulty: "low" },
      { insight: "Offline-first is a cheap differentiator", difficulty: "medium" },
      { insight: "Time-of-day personalisation is unclaimed", difficulty: "medium" },
    ],
    evidence: packet("").evidence,
    agentSummary:
      `${appName} teardown: the core loop is a daily wind-down → session → streak retention engine; ` +
      "monetisation is annual-first subscription behind a post-onboarding paywall. " +
      "Clearest clone wedge: offline-first + time-of-day personalisation, both unmet in reviews.",
    source: "mock",
    generatedAt: now(),
  };
}

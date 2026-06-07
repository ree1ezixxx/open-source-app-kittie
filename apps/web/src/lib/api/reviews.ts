/* ============================================================
   Lane D — Reviews API client (isolated; do NOT fold into lib/api.ts)

   Two surfaces with very different honesty levels:
   • REAL   — POST /api/v1/reviews returns live review *text* (13,320 rows).
   • MOCK   — sentiment / semantics / improvements are NOT built on the
              backend yet. They live behind this typed interface so the UI
              can render the real shape today and swap to a live source the
              moment one exists. Every mock surface carries `mock: true`
              so the UI can label it honestly — never imply it's computed.
   ============================================================ */
import type { Review, Store } from "@kittie/types";

const BASE = "/api/v1";

/* ----------------------------------------------------------------
   REAL — review text
   ---------------------------------------------------------------- */
export interface ReviewsResponse {
  data: Review[];
  meta: { source: string; stale: boolean };
}

export async function fetchReviews(
  appId: string,
  opts: { country?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ReviewsResponse> {
  const res = await fetch(`${BASE}/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appId,
      country: opts.country ?? "US",
      limit: opts.limit ?? 100,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
  return (await res.json()) as ReviewsResponse;
}

/* Rating distribution derived from REAL review rows — not mocked. */
export function ratingDistribution(reviews: Review[]): Record<1 | 2 | 3 | 4 | 5, number> {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const k = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    dist[k]++;
  }
  return dist;
}

export function averageRating(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
}

/* ----------------------------------------------------------------
   MOCK — sentiment / semantics / improvements (typed, labelled)

   The shapes below are the contract a future `reviews.sentiment` /
   `reviews.semantics` / `reviews.improvements` backend would satisfy.
   Until then `getReviewInsights()` returns deterministic, clearly-flagged
   sample data derived loosely from the real rating mix so the screens are
   demonstrable. Swap this one function for a fetch() when the API lands.
   ---------------------------------------------------------------- */
export type Sentiment = "positive" | "neutral" | "negative";

export interface SentimentSummary {
  positive: number; // 0..1
  neutral: number;
  negative: number;
  netScore: number; // -100..100
}

export interface SemanticCluster {
  id: string;
  label: string;
  sentiment: Sentiment;
  mentions: number; // share-of-voice weight
  share: number; // 0..1
  sampleQuote: string;
}

export interface ImprovementSuggestion {
  id: string;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  evidence: number; // # of reviews backing it
}

export interface ReviewInsights {
  mock: true;
  sentiment: SentimentSummary;
  clusters: SemanticCluster[];
  improvements: ImprovementSuggestion[];
}

/** Deterministic mock insights. `mock: true` is load-bearing — the UI labels it. */
export function getReviewInsights(reviews: Review[]): ReviewInsights {
  const dist = ratingDistribution(reviews);
  const total = reviews.length || 1;
  const pos = (dist[4] + dist[5]) / total;
  const neg = (dist[1] + dist[2]) / total;
  const neu = Math.max(0, 1 - pos - neg);
  const netScore = Math.round((pos - neg) * 100);

  return {
    mock: true,
    sentiment: { positive: pos, neutral: neu, negative: neg, netScore },
    clusters: [
      {
        id: "perf",
        label: "Performance & crashes",
        sentiment: "negative",
        mentions: 412,
        share: 0.27,
        sampleQuote: "Keeps freezing during livestreams, have to force-close.",
      },
      {
        id: "ux",
        label: "Navigation & UX",
        sentiment: "negative",
        mentions: 318,
        share: 0.21,
        sampleQuote: "Autoplay on open is a terrible UX decision.",
      },
      {
        id: "value",
        label: "Pricing & subscription",
        sentiment: "negative",
        mentions: 240,
        share: 0.16,
        sampleQuote: "Paying for Premium and emotes still don't work.",
      },
      {
        id: "content",
        label: "Content & recommendations",
        sentiment: "positive",
        mentions: 286,
        share: 0.19,
        sampleQuote: "The recommendation feed is genuinely excellent.",
      },
      {
        id: "core",
        label: "Core experience",
        sentiment: "positive",
        mentions: 255,
        share: 0.17,
        sampleQuote: "Indispensable — I use it every single day.",
      },
    ],
    improvements: [
      {
        id: "i1",
        title: "Fix livestream emote rendering for Premium users",
        detail:
          "A recurring cluster of 1★ reviews from paying subscribers reports emotes failing during livestreams. High-value churn risk.",
        impact: "high",
        effort: "medium",
        evidence: 412,
      },
      {
        id: "i2",
        title: "Make autoplay-on-open opt-in",
        detail:
          "Multiple reviewers cite the app auto-resuming video on launch as jarring. A settings toggle would defuse the complaint.",
        impact: "medium",
        effort: "low",
        evidence: 318,
      },
      {
        id: "i3",
        title: "Address subscription value perception",
        detail:
          "Reviews tie price increases to unfixed bugs. Bundling a tangible new Premium benefit could shift sentiment.",
        impact: "medium",
        effort: "high",
        evidence: 240,
      },
    ],
  };
}

/* ----------------------------------------------------------------
   Monitored-apps store — localStorage (no user/auth backend; G-gap).
   Lane R-owned key; favorites/tracking lanes use their own namespaces.
   ---------------------------------------------------------------- */
export interface MonitoredApp {
  id: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  store: Store;
  reviewCount: number;
  rating: number | null;
}

const STORE_KEY = "kittie.reviews.monitored.v1";

export function getMonitored(): MonitoredApp[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MonitoredApp[]) : [];
  } catch {
    return [];
  }
}

export function setMonitored(apps: MonitoredApp[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(apps));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function addMonitored(app: MonitoredApp): MonitoredApp[] {
  const cur = getMonitored();
  if (cur.some((a) => a.id === app.id)) return cur;
  const next = [...cur, app];
  setMonitored(next);
  return next;
}

export function removeMonitored(id: string): MonitoredApp[] {
  const next = getMonitored().filter((a) => a.id !== id);
  setMonitored(next);
  return next;
}

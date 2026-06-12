/* ============================================================
   Lane D — Review intelligence layer.

   This mirrors appkittie.com's architecture: every review is TAGGED once
   (sentiment + topics + improvement-areas), then every surface — the feed
   filters, per-review badges, the Semantics tab and the Improvements tab —
   is a cheap aggregation over those tags. No AI runs at render time.

   ┌───────────────────────────────────────────────────────────────┐
   │  THE LLM SEAM is `classifyReview()` below — the ONLY place the  │
   │  classifier lives. Today it's an interim heuristic (rating →    │
   │  sentiment, keyword → topic/area) so the page is fully          │
   │  functional with real data. Swap that one function's body for   │
   │  a batched LLM call (run at ingest, cached) for production      │
   │  quality. Nothing downstream changes.                           │
   └───────────────────────────────────────────────────────────────┘
   ============================================================ */
import type { Review } from "@kittie/types";

export type Sentiment4 = "positive" | "neutral" | "negative" | "mixed";

export interface ReviewTags {
  sentiment: Sentiment4;
  /** Open-ish themes — what the review is *about*. */
  topics: string[];
  /** Canonical, fixed taxonomy — what the app could *fix*. */
  improvementAreas: string[];
}

export interface TaggedReview {
  review: Review;
  tags: ReviewTags;
}

/* ----------------------------------------------------------------
   Taxonomies. `improvementAreas` is a FIXED canonical list (same across
   every app, like the real product). `topics` is a broader descriptive
   set. Both are keyword-driven in the interim; the LLM will replace the
   matching with real semantic classification (and open-set topics).
   ---------------------------------------------------------------- */
interface Category {
  label: string;
  keywords: string[];
}

/** What the app is *about* — descriptive themes. Multi-label. */
const TOPICS: Category[] = [
  { label: "Subscription Pricing", keywords: ["subscription", "premium", "price", "expensive", "overpriced", "cost", "monthly", "per month", "worth the", "too much money", "cheap"] },
  { label: "App Performance", keywords: ["crash", "crashes", "freeze", "frozen", "lag", "laggy", "slow", "buggy", "glitch", "glitches", "broken", "won't load", "keeps closing", "force close"] },
  { label: "Customer Support", keywords: ["support", "customer service", "help desk", "no response", "never replied", "contact", "ticket", "unhelpful", "no one responds"] },
  { label: "Account Access", keywords: ["log in", "login", "sign in", "signin", "password", "locked out", "can't access", "account locked", "verification", "two factor", "2fa"] },
  { label: "Payment Issues", keywords: ["charged", "charge", "billing", "refund", "double charged", "payment failed", "transaction", "credit card", "money back"] },
  { label: "User Interface", keywords: ["interface", "ui", "ux", "layout", "design", "confusing", "cluttered", "hard to navigate", "clunky", "intuitive"] },
  { label: "Ads & Interruptions", keywords: ["ad ", "ads", "advert", "advertisement", "commercial", "too many ads", "pop up", "popup"] },
  { label: "Content & Library", keywords: ["content", "library", "catalog", "recommend", "recommendation", "feed", "playlist", "video", "song", "selection"] },
  { label: "Features", keywords: ["feature", "missing", "wish it had", "needs a", "add the ability", "option to", "functionality"] },
  { label: "Notifications", keywords: ["notification", "notify", "alert", "reminder", "spam notification"] },
];

/** What the app could *fix* — fixed canonical taxonomy. Multi-label. */
const IMPROVEMENT_AREAS: Category[] = [
  { label: "Feature Functionality", keywords: ["feature", "doesn't work", "not working", "broken", "missing", "functionality", "bug", "glitch", "won't", "can't get it to"] },
  { label: "App Performance", keywords: ["crash", "freeze", "lag", "slow", "load", "buggy", "force close", "keeps closing"] },
  { label: "Billing Accuracy", keywords: ["charged", "billing", "double charged", "wrong charge", "overcharged", "refund", "transaction"] },
  { label: "Cancellation Process", keywords: ["cancel", "cancellation", "unsubscribe", "can't cancel", "hard to cancel", "still charged after"] },
  { label: "Payment Options", keywords: ["payment", "payment method", "card declined", "paypal", "apple pay", "pay with"] },
  { label: "App Value", keywords: ["not worth", "waste of money", "overpriced", "expensive", "rip off", "cash grab", "paywall"] },
  { label: "Account Recovery", keywords: ["locked out", "recover", "reset password", "can't log in", "account locked", "lost access"] },
  { label: "Push Notifications", keywords: ["notification", "too many notification", "spam", "alert", "reminder"] },
  { label: "Customer Support", keywords: ["support", "no response", "never replied", "customer service", "unhelpful", "contact"] },
  { label: "User Interface", keywords: ["interface", "confusing", "cluttered", "hard to navigate", "clunky", "ui", "ux", "design"] },
  { label: "Free Trial Policy", keywords: ["free trial", "trial", "charged after trial", "trial ended"] },
  { label: "Data Security", keywords: ["privacy", "data", "security", "tracking", "personal information", "hacked", "breach"] },
  { label: "Cross-Platform Sync", keywords: ["sync", "syncing", "across devices", "desktop", "web version", "different device"] },
  { label: "Content Moderation", keywords: ["moderation", "report", "abuse", "spam content", "inappropriate", "banned"] },
];

const POSITIVE_WORDS = ["love", "great", "excellent", "amazing", "perfect", "best", "awesome", "fantastic", "brilliant", "good", "useful", "indispensable", "favorite", "recommend"];
const NEGATIVE_WORDS = ["hate", "terrible", "awful", "worst", "useless", "broken", "trash", "garbage", "disappointing", "frustrating", "annoying", "scam", "rip off", "ripoff", "waste"];

function matchCategories(text: string, cats: Category[]): string[] {
  const hits: string[] = [];
  for (const c of cats) {
    if (c.keywords.some((k) => text.includes(k))) hits.push(c.label);
  }
  return hits;
}

/* ================================================================
   ███  THE LLM SEAM — classifyReview()  ███
   Interim heuristic. Replace the body with a batched LLM call (at
   ingest, cached per review) to get production-grade classification.
   Contract (input Review → output ReviewTags) stays identical.
   ================================================================ */
export function classifyReview(r: Review): ReviewTags {
  const text = `${r.title ?? ""} ${r.body}`.toLowerCase();
  const rating = Math.round(r.rating); // 1-5; matches ReviewsTab filter rounding
  const hasPos = POSITIVE_WORDS.some((w) => text.includes(w));
  const hasNeg = NEGATIVE_WORDS.some((w) => text.includes(w));

  let sentiment: Sentiment4;
  if (rating >= 4) sentiment = hasNeg ? "mixed" : "positive";
  else if (rating <= 2) sentiment = hasPos ? "mixed" : "negative";
  else sentiment = hasPos && hasNeg ? "mixed" : "neutral";

  return {
    sentiment,
    topics: matchCategories(text, TOPICS),
    improvementAreas: matchCategories(text, IMPROVEMENT_AREAS),
  };
}

/** Prefer the tags the server persisted at ingest; only fall back to the local
    classifier for any legacy row that predates server-side tagging. */
function tagsFor(r: Review): ReviewTags {
  if (r.sentiment) {
    return {
      sentiment: r.sentiment,
      topics: r.topics ?? [],
      improvementAreas: r.improvementAreas ?? [],
    };
  }
  return classifyReview(r);
}

export function enrichReviews(reviews: Review[]): TaggedReview[] {
  return reviews.map((review) => ({ review, tags: tagsFor(review) }));
}

/* ----------------------------------------------------------------
   Aggregation helpers — pure, cheap, run at render time.
   ---------------------------------------------------------------- */
/** Filter to reviews within `periodDays` of the MOST RECENT review — not "now".
   The review DB is historical (a given app's newest review can be days/months
   old), so anchoring the window to today empties out short periods. Anchoring
   to the newest review makes every period button filter meaningfully. */
export function withinPeriod(tagged: TaggedReview[], periodDays: number | null): TaggedReview[] {
  if (!periodDays) return tagged;
  let anchor = 0;
  for (const t of tagged) {
    const ts = new Date(t.review.reviewedAt).getTime();
    if (Number.isFinite(ts) && ts > anchor) anchor = ts;
  }
  if (!anchor) return tagged;
  const cutoff = anchor - periodDays * 86_400_000;
  return tagged.filter((t) => {
    const ts = new Date(t.review.reviewedAt).getTime();
    return Number.isFinite(ts) ? ts >= cutoff : true;
  });
}

/** Dominant sentiment across a set of reviews (mixed if pos & neg are close). */
function dominantSentiment(items: TaggedReview[]): Sentiment4 {
  let pos = 0, neg = 0, neu = 0;
  for (const t of items) {
    if (t.tags.sentiment === "positive") pos++;
    else if (t.tags.sentiment === "negative") neg++;
    else if (t.tags.sentiment === "mixed") { pos += 0.5; neg += 0.5; }
    else neu++;
  }
  if (pos === 0 && neg === 0) return "neutral";
  const ratio = pos / (pos + neg);
  if (ratio >= 0.6) return "positive";
  if (ratio <= 0.4) return "negative";
  return "mixed";
}

/* ---- Time series over a tag dimension (topics OR improvement areas) ----
   Mirrors appkittie's getTopicTimeSeries / improvement trends: bucket each
   tagged review by day, group by dimension label, count per bucket. ---- */
export interface TopicPeriod { key: string; label: string; }
export type Granularity = "day" | "week" | "month" | "quarter";
export interface SeriesRow {
  label: string;
  sentiment: Sentiment4;
  totalMentions: number;
  avgRating: number;
  periodValues: Record<string, number>;
}
export interface DimensionTimeSeries {
  periods: TopicPeriod[];
  rows: SeriesRow[];
  /** How reviews were bucketed along the x-axis — drives the surface labels. */
  granularity: Granularity;
}

/* ---- Adaptive time bucketing ----
   Per-day buckets are noise when an app gets 0–2 mentions/day across months
   (every line just flickers 0↔1). So we pick the bucket size from the actual
   date span — day for short windows, week for medium, month for long — so each
   point carries a meaningful, accumulated value and the lines read cleanly. */
const GRANULARITY_LABEL: Record<Granularity, string> = { day: "day", week: "week", month: "month", quarter: "quarter" };

function chooseGranularity(spanDays: number): Granularity {
  if (spanDays <= 24) return "day";       // ~daily, short window
  if (spanDays <= 120) return "week";     // ~17 weeks
  if (spanDays <= 750) return "month";    // ≤ ~24 months
  return "quarter";                       // multi-year → ~quarters, keeps it ~30 pts
}

function startOfWeekMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  if (g === "quarter") return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  if (g === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (g === "week") return new Date(startOfWeekMs(d.getTime())).toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function bucketLabel(key: string, g: Granularity, showYear: boolean): string {
  if (key === "—") return key;
  if (g === "quarter") {
    const [y, q] = key.split("-Q");
    return `Q${q} '${(y ?? "").slice(2)}`;
  }
  if (g === "month") {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y ?? 1970, (m ?? 1) - 1, 1);
    return d.toLocaleDateString(undefined, showYear ? { month: "short", year: "2-digit" } : { month: "short" });
  }
  const d = new Date(key + "T00:00:00");
  if (!Number.isFinite(d.getTime())) return key;
  return d.toLocaleDateString(undefined, showYear ? { month: "short", day: "numeric", year: "2-digit" } : { month: "short", day: "numeric" });
}

function dimensionTimeSeries(
  all: TaggedReview[],
  periodDays: number | null,
  pick: (t: TaggedReview) => string[],
): DimensionTimeSeries {
  const items = withinPeriod(all, periodDays);

  // Date span → bucket granularity + whether labels need a year disambiguator.
  let min = Infinity, max = -Infinity;
  for (const t of items) {
    const ts = new Date(t.review.reviewedAt).getTime();
    if (Number.isFinite(ts)) { if (ts < min) min = ts; if (ts > max) max = ts; }
  }
  const spanDays = Number.isFinite(min) && Number.isFinite(max) ? (max - min) / 86_400_000 : 0;
  const granularity = chooseGranularity(spanDays);
  const showYear = Number.isFinite(min) && Number.isFinite(max) && new Date(min).getFullYear() !== new Date(max).getFullYear();
  const keyOf = (t: TaggedReview) => bucketKey(t.review.reviewedAt, granularity);

  const bucketKeys = [...new Set(items.map(keyOf))].filter((k) => k !== "—").sort();
  const periods: TopicPeriod[] = bucketKeys.map((k) => ({ key: k, label: bucketLabel(k, granularity, showYear) }));

  const by = new Map<string, TaggedReview[]>();
  for (const t of items) {
    for (const label of pick(t)) {
      if (!by.has(label)) by.set(label, []);
      by.get(label)!.push(t);
    }
  }

  const rows: SeriesRow[] = [...by.entries()].map(([label, list]) => {
    const periodValues: Record<string, number> = {};
    for (const t of list) {
      const k = keyOf(t);
      periodValues[k] = (periodValues[k] ?? 0) + 1;
    }
    const avgRating = list.reduce((s, t) => s + t.review.rating, 0) / list.length;
    return { label, sentiment: dominantSentiment(list), totalMentions: list.length, avgRating, periodValues };
  });

  rows.sort((a, b) => b.totalMentions - a.totalMentions);
  return { periods, rows, granularity };
}

export { GRANULARITY_LABEL };

export function topicTimeSeries(all: TaggedReview[], periodDays: number | null = null): DimensionTimeSeries {
  return dimensionTimeSeries(all, periodDays, (t) => t.tags.topics);
}

export function improvementTimeSeries(all: TaggedReview[], periodDays: number | null = null): DimensionTimeSeries {
  return dimensionTimeSeries(all, periodDays, (t) => t.tags.improvementAreas);
}

/* ---- Improvements: ranked areas (matches getImprovements) ---- */
export interface ImprovementArea {
  id: string;
  category: string;
  sentiment: Sentiment4;
  mentionCount: number;
  avgRating: number;
  share: number; // 0..1 of total mentions
}
export interface ImprovementsResult {
  improvements: ImprovementArea[];
  totalMentions: number;
}

export function improvementAreas(all: TaggedReview[], periodDays: number | null = null): ImprovementsResult {
  const items = withinPeriod(all, periodDays);
  const byArea = new Map<string, TaggedReview[]>();
  for (const t of items) {
    for (const area of t.tags.improvementAreas) {
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area)!.push(t);
    }
  }
  const totalMentions = [...byArea.values()].reduce((s, l) => s + l.length, 0) || 1;
  const improvements: ImprovementArea[] = [...byArea.entries()].map(([category, list]) => ({
    id: category,
    category,
    sentiment: dominantSentiment(list),
    mentionCount: list.length,
    avgRating: list.reduce((s, t) => s + t.review.rating, 0) / list.length,
    share: list.length / totalMentions,
  }));
  improvements.sort((a, b) => b.mentionCount - a.mentionCount);
  return { improvements, totalMentions };
}

/* ---- Feed filter facets ---- */
export interface Facet { label: string; count: number; }

export function sentimentCounts(tagged: TaggedReview[]): Record<Sentiment4, number> {
  const c: Record<Sentiment4, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  for (const t of tagged) c[t.tags.sentiment]++;
  return c;
}

export function topicFacets(tagged: TaggedReview[]): Facet[] {
  const m = new Map<string, number>();
  for (const t of tagged) for (const topic of t.tags.topics) m.set(topic, (m.get(topic) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function improvementFacets(tagged: TaggedReview[]): Facet[] {
  const m = new Map<string, number>();
  for (const t of tagged) for (const a of t.tags.improvementAreas) m.set(a, (m.get(a) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export const SENTIMENT_LABEL: Record<Sentiment4, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  mixed: "Mixed",
};

/** Directional glyph for the timeline/grid (matches appkittie's ↗ / ↘ / —). */
export const SENTIMENT_ARROW: Record<Sentiment4, string> = {
  positive: "↗",
  neutral: "→",
  negative: "↘",
  mixed: "—",
};

/** Distinct line colours for multi-series trend charts (dark-bg safe).
   Matches appkittie's recharts palette order — lime lead, then the same
   10-colour rotation — so the trend graphs read identically. */
export const SERIES_PALETTE = [
  "#c8ff00", "#00d4ff", "#ff6b6b", "#a78bfa", "#34d399",
  "#f472b6", "#fbbf24", "#60a5fa", "#fb923c", "#e879f9",
  "#22d3ee", "#f87171",
];

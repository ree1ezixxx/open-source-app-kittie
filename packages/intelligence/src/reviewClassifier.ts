/* ============================================================
   Review classifier — THE SEAM.

   Every review is tagged ONCE at ingest (sentiment + topics +
   improvement-areas) and the tags are persisted to the DB. Every surface
   (feed filters, per-review badges, Semantics, Improvements, the All-Apps
   rollup) is then a cheap aggregation over stored tags — no classifier runs
   at render time.

   ┌───────────────────────────────────────────────────────────────┐
   │  `classifyReview()` is the ONLY place the classifier lives.     │
   │  Today it's an interim heuristic (rating → sentiment, keyword → │
   │  topic/area). Swap that one function's body for a batched LLM   │
   │  call for production quality — nothing downstream changes, and  │
   │  re-running it backfills `null` tags on a sweep.                │
   └───────────────────────────────────────────────────────────────┘
   ============================================================ */
import type { ReviewTags, Sentiment4 } from "@kittie/types";

export type { ReviewTags, Sentiment4 };

/** The minimal shape the classifier needs — works on a DB row or an API DTO. */
export interface ClassifiableReview {
  rating: number;
  title: string | null;
  body: string;
}

interface Category {
  label: string;
  keywords: string[];
}

/** What the review is *about* — descriptive themes. Multi-label. */
const TOPICS: Category[] = [
  { label: "Subscription Pricing", keywords: ["subscription", "premium", "price", "expensive", "overpriced", "cost", "monthly", "per month", "worth the", "too much money", "cheap"] },
  { label: "App Performance", keywords: ["crash", "crashes", "crashing", "freeze", "freezes", "frozen", "freezing", "lag", "laggy", "lagging", "slow", "buggy", "glitch", "glitches", "broken", "won't load", "keeps closing", "force close"] },
  { label: "Customer Support", keywords: ["support", "customer service", "help desk", "no response", "never replied", "contact", "ticket", "unhelpful", "no one responds"] },
  { label: "Account Access", keywords: ["log in", "login", "sign in", "signin", "password", "locked out", "can't access", "account locked", "verification", "two factor", "2fa"] },
  { label: "Payment Issues", keywords: ["charged", "charge", "billing", "refund", "double charged", "payment failed", "transaction", "credit card", "money back"] },
  { label: "User Interface", keywords: ["interface", "ui", "ux", "layout", "design", "confusing", "cluttered", "hard to navigate", "clunky", "intuitive"] },
  { label: "Ads & Interruptions", keywords: ["ad", "ads", "advert", "advertisement", "advertising", "commercial", "too many ads", "pop up", "popup"] },
  { label: "Content & Library", keywords: ["content", "library", "catalog", "recommend", "recommendation", "feed", "playlist", "video", "song", "selection"] },
  { label: "Features", keywords: ["feature", "missing", "wish it had", "needs a", "add the ability", "option to", "functionality"] },
  { label: "Notifications", keywords: ["notification", "notify", "alert", "reminder", "spam notification"] },
];

/** What the app could *fix* — fixed canonical taxonomy. Multi-label. */
const IMPROVEMENT_AREAS: Category[] = [
  { label: "Feature Functionality", keywords: ["feature", "doesn't work", "not working", "broken", "missing", "functionality", "bug", "glitch", "won't", "can't get it to"] },
  { label: "App Performance", keywords: ["crash", "freeze", "lag", "slow", "load", "buggy", "force close", "keeps closing"] },
  { label: "Billing Accuracy", keywords: ["charged", "billing", "double charged", "wrong charge", "overcharged", "refund", "transaction"] },
  { label: "Cancellation Process", keywords: ["cancel", "canceled", "cancelled", "cancellation", "unsubscribe", "can't cancel", "hard to cancel", "still charged after"] },
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

const POSITIVE_WORDS = ["love", "loved", "great", "excellent", "amazing", "perfect", "best", "awesome", "fantastic", "brilliant", "good", "useful", "indispensable", "favorite", "recommend", "recommended"];
const NEGATIVE_WORDS = ["hate", "hated", "terrible", "awful", "worst", "useless", "broken", "trash", "garbage", "disappointing", "frustrating", "annoying", "scam", "rip off", "ripoff", "waste"];

/* ---- boundary-safe keyword matching (#266) --------------------------------
   `text.includes(k)` substring-matched short keywords inside longer words —
   "ads" hit "loads"/"reads"/"salads", inflating tag buckets that every
   downstream consumer (feeds, reviewInsights, cluster_reviews, feature-gap
   demand) then trusted. Keywords now match only at word boundaries, with a
   free trailing plural "s" so singular entries still catch plurals. Compiled
   once at module load. */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileKeyword(k: string, freePlural = true): RegExp {
  // Boundary = start/end of text or any non-alphanumeric. `\b` alone fails on
  // keywords that end in punctuation-adjacent positions and on unicode text.
  // `freePlural` lets singular category keywords catch plurals; sentiment words
  // opt out (cold-verify finding: "goods" must not fire positive "good").
  return new RegExp(`(?:^|[^a-z0-9])${escapeRe(k)}${freePlural ? "s?" : ""}(?:$|[^a-z0-9])`);
}

interface CompiledCategory {
  label: string;
  patterns: RegExp[];
}

const compileCategories = (cats: Category[]): CompiledCategory[] =>
  cats.map((c) => ({ label: c.label, patterns: c.keywords.map((k) => compileKeyword(k)) }));

const TOPIC_PATTERNS = compileCategories(TOPICS);
const IMPROVEMENT_PATTERNS = compileCategories(IMPROVEMENT_AREAS);
const POSITIVE_PATTERNS = POSITIVE_WORDS.map((w) => compileKeyword(w, false));
const NEGATIVE_PATTERNS = NEGATIVE_WORDS.map((w) => compileKeyword(w, false));

function matchCategories(text: string, cats: CompiledCategory[]): string[] {
  const hits: string[] = [];
  for (const c of cats) {
    if (c.patterns.some((p) => p.test(text))) hits.push(c.label);
  }
  return hits;
}

/* ================================================================
   ███  THE SEAM — classifyReview()  ███
   Interim heuristic. Replace the body with a batched LLM call (run
   at ingest, persisted) for production-grade classification. The
   contract (ClassifiableReview → ReviewTags) stays identical.
   ================================================================ */
export function classifyReview(r: ClassifiableReview): ReviewTags {
  const text = `${r.title ?? ""} ${r.body}`.toLowerCase();
  const rating = Math.round(r.rating);
  const hasPos = POSITIVE_PATTERNS.some((p) => p.test(text));
  const hasNeg = NEGATIVE_PATTERNS.some((p) => p.test(text));

  let sentiment: Sentiment4;
  if (rating >= 4) sentiment = hasNeg ? "mixed" : "positive";
  else if (rating <= 2) sentiment = hasPos ? "mixed" : "negative";
  else sentiment = hasPos && hasNeg ? "mixed" : "neutral";

  return {
    sentiment,
    topics: matchCategories(text, TOPIC_PATTERNS),
    improvementAreas: matchCategories(text, IMPROVEMENT_PATTERNS),
  };
}

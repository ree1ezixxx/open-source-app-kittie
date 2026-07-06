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
   │  `pnpm ingest:retag` re-tags the corpus after any change here.  │
   └───────────────────────────────────────────────────────────────┘

   TAXONOMY v2 (#272): labels name the DECISION-RELEVANT pain a product team
   acts on ("Trial & Billing Deception", "Notification Fatigue"), not generic
   surfaces ("Features"). Design rationale + per-label definitions live in
   docs/contracts/review-taxonomy.md — change them together. Old→new mapping
   for historical comparisons: MIGRATION_MAP below.
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

/** What the review is *about* — descriptive surfaces. Multi-label. */
const TOPICS: Category[] = [
  { label: "Ads Experience", keywords: ["ad", "ads", "advert", "adverts", "advertisement", "advertising", "commercial", "too many ads", "pop up", "popup", "interstitial", "watch an ad"] },
  { label: "Pricing & Subscription", keywords: ["subscription", "premium", "price", "expensive", "overpriced", "cost", "monthly", "per month", "paywall", "free tier", "free version", "trial", "worth the", "too much money", "cheap"] },
  { label: "Stability & Performance", keywords: ["crash", "crashes", "crashing", "freeze", "freezes", "frozen", "freezing", "lag", "laggy", "lagging", "slow", "buggy", "bug", "glitch", "glitches", "glitchy", "broken", "won't load", "keeps closing", "force close", "loading forever"] },
  { label: "Onboarding & Signup", keywords: ["onboarding", "sign up", "signup", "create an account", "create account", "tutorial", "getting started", "walkthrough", "set up", "setup"] },
  { label: "Account & Login", keywords: ["log in", "login", "sign in", "signin", "password", "locked out", "can't access", "account locked", "verification", "two factor", "2fa"] },
  { label: "Billing & Refunds", keywords: ["charged", "charge", "billing", "refund", "double charged", "payment failed", "transaction", "credit card", "money back", "auto renew", "auto-renew", "autorenew"] },
  { label: "Design & Usability", keywords: ["interface", "ui", "ux", "layout", "design", "confusing", "cluttered", "hard to navigate", "clunky", "intuitive", "redesign"] },
  { label: "Content Quality", keywords: ["content", "lesson", "lessons", "course", "courses", "library", "catalog", "level", "levels", "exercise", "exercises", "selection", "playlist", "video", "videos", "song", "songs", "repetitive", "outdated"] },
  { label: "Feature Requests", keywords: ["wish it had", "missing", "needs a", "add the ability", "option to", "please add", "would love", "would be nice", "feature request", "suggestion"] },
  { label: "Notifications", keywords: ["notification", "notifications", "notify", "alert", "alerts", "reminder", "reminders"] },
  { label: "Progress & Data", keywords: ["progress", "streak", "lost my progress", "lost progress", "data loss", "wiped", "reset my", "sync", "syncing", "backup", "restore"] },
  { label: "Privacy & Security", keywords: ["privacy", "personal information", "personal data", "my data", "tracking me", "hacked", "breach", "permissions", "creepy"] },
  { label: "Support & Service", keywords: ["support", "customer service", "help desk", "no response", "never replied", "contact", "ticket", "unhelpful", "no one responds"] },
  { label: "Accessibility", keywords: ["accessibility", "voiceover", "screen reader", "font size", "colorblind", "colour blind", "color blind", "dyslexia", "hard of hearing", "subtitles"] },
];

/** What the app could *fix* — decision-relevant pain a product team acts on. Multi-label. */
const IMPROVEMENT_AREAS: Category[] = [
  { label: "Ad Intrusiveness", keywords: ["too many ads", "ad after every", "ads after every", "unskippable", "forced to watch", "ad every", "constant ads", "bombarded with ads", "more ads than"] },
  { label: "Subscription Lock-In", keywords: ["paywall", "paywalled", "locked behind", "used to be free", "now you have to pay", "pay to", "everything costs", "cash grab", "greedy", "not worth", "waste of money", "overpriced"] },
  { label: "Trial & Billing Deception", keywords: ["charged after trial", "charged without", "didn't authorize", "auto renewed", "auto-renewed", "hard to cancel", "can't cancel", "still charged", "cancelled but", "canceled but", "kept charging", "sneaky"] },
  { label: "Refund Friction", keywords: ["refund refused", "refund denied", "no refund", "won't refund", "can't get my money back", "money back"] },
  { label: "Accuracy Failure", keywords: ["inaccurate", "wrong", "incorrect", "false", "miscounted", "miscounts", "doesn't track properly", "not accurate", "errors in", "mistranslation", "mistranslated"] },
  { label: "Crash & Data Loss", keywords: ["crash", "crashes", "crashing", "lost my progress", "lost progress", "lost my data", "lost all my", "wiped", "corrupted", "reset everything", "deleted my"] },
  { label: "Performance Drag", keywords: ["slow", "lag", "laggy", "lagging", "loading forever", "takes forever", "freezes", "freezing", "battery drain", "drains battery"] },
  { label: "Onboarding Confusion", keywords: ["confusing to set up", "don't understand how", "no instructions", "hard to get started", "can't figure out", "not clear how"] },
  { label: "Navigation & Usability", keywords: ["hard to find", "can't find", "hard to navigate", "confusing", "cluttered", "clunky", "too many taps", "buried in menus", "hard to use"] },
  { label: "Notification Fatigue", keywords: ["too many notifications", "constant notifications", "notification spam", "spams me", "guilt trip", "guilt trips", "passive aggressive", "won't stop reminding"] },
  { label: "Missing Export & Portability", keywords: ["export", "download my data", "csv", "transfer my", "portability", "move my data", "import from"] },
  { label: "Sync Reliability", keywords: ["sync broken", "sync failed", "sync issues", "doesn't sync", "won't sync", "out of sync", "across devices", "desync"] },
  { label: "Support Unresponsiveness", keywords: ["no response", "never replied", "no way to contact", "automated replies", "automated response", "unhelpful support", "support is useless", "no customer service"] },
  { label: "Privacy Anxiety", keywords: ["selling my data", "sells my data", "sell your data", "too many permissions", "tracking me", "creepy", "don't trust it with", "invasive"] },
  { label: "Content Gaps", keywords: ["not enough content", "not enough levels", "not enough lessons", "ran out of", "limited content", "limited selection", "repetitive", "outdated", "needs more content", "more levels"] },
  { label: "Account Recovery Trouble", keywords: ["locked out", "can't recover", "lost my account", "reset password doesn't", "reset password not", "recovery email", "lost access"] },
];

/**
 * Old (v1) label → v2 label(s), both dimensions — so historical comparisons
 * against pre-#272 tag snapshots don't silently break. A v1 label maps to the
 * v2 label(s) that absorb its intent; consumers doing longitudinal analysis
 * should translate v1 data through this map.
 */
export const MIGRATION_MAP: Record<string, string[]> = {
  // topics v1 → v2
  "Subscription Pricing": ["Pricing & Subscription"],
  "App Performance": ["Stability & Performance", "Performance Drag"],
  "Customer Support": ["Support & Service", "Support Unresponsiveness"],
  "Account Access": ["Account & Login", "Account Recovery Trouble"],
  "Payment Issues": ["Billing & Refunds", "Trial & Billing Deception"],
  "User Interface": ["Design & Usability", "Navigation & Usability"],
  "Ads & Interruptions": ["Ads Experience", "Ad Intrusiveness"],
  "Content & Library": ["Content Quality", "Content Gaps"],
  Features: ["Feature Requests"],
  Notifications: ["Notifications", "Notification Fatigue"],
  // improvement-areas v1 → v2
  "Feature Functionality": ["Accuracy Failure", "Feature Requests"],
  "Billing Accuracy": ["Trial & Billing Deception", "Refund Friction"],
  "Cancellation Process": ["Trial & Billing Deception"],
  "Payment Options": ["Billing & Refunds"],
  "App Value": ["Subscription Lock-In"],
  "Account Recovery": ["Account Recovery Trouble"],
  "Push Notifications": ["Notification Fatigue"],
  "Free Trial Policy": ["Trial & Billing Deception"],
  "Data Security": ["Privacy Anxiety", "Privacy & Security"],
  "Cross-Platform Sync": ["Sync Reliability"],
  "Content Moderation": ["Content Quality"],
};

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

/** Curly quotes/apostrophes → ASCII so "won’t load" matches "won't load" (#272). */
function normalize(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').toLowerCase();
}

/* ================================================================
   ███  THE SEAM — classifyReview()  ███
   Interim heuristic. Replace the body with a batched LLM call (run
   at ingest, persisted) for production-grade classification. The
   contract (ClassifiableReview → ReviewTags) stays identical.
   ================================================================ */
export function classifyReview(r: ClassifiableReview): ReviewTags {
  const text = normalize(`${r.title ?? ""} ${r.body}`);
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

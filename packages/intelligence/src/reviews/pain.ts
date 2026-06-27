import type { PainCluster } from "@kittie/types";

// Review pain-cluster extractor (#172). Pure + deterministic — no LLM — so it's
// unit-testable on fixtures. Turns raw reviews into ranked, buildable pain
// themes. An LLM narrative layer can sit on top later; the signal stays here.

export interface PainReviewInput {
  /** Title + body (or body) of the review. */
  text: string;
  rating: number | null;
  version?: string | null;
  date?: string | null;
}

export interface PainAnalysis {
  clusters: PainCluster[];
  /** 0..100 — concentrated, negative-skewed complaints score high. null if too thin. */
  score: number | null;
  sampleSize: number;
}

/** Minimum reviews before a Pain score is trustworthy. */
export const MIN_PAIN_SAMPLE = 8;

interface ThemeDef {
  theme: string;
  keywords: string[];
  opportunity: string;
}

// Substring lexicon — deterministic and explainable. Order is salience-neutral;
// ranking happens by observed frequency/negativity.
const THEMES: ThemeDef[] = [
  {
    theme: "Pricing & paywalls",
    keywords: ["expensive", "overpriced", "too much money", "not worth", "price", "subscription", "paywall", "refund", "rip off", "rip-off"],
    opportunity: "A transparent, fairly-priced alternative with a clear value moment before the paywall.",
  },
  {
    theme: "Crashes & bugs",
    keywords: ["crash", "crashes", "bug", "buggy", "freeze", "frozen", "broken", "glitch", "keeps closing", "won't open", "wont open"],
    opportunity: "A stable, reliable build — incumbents are leaking trust on crashes.",
  },
  {
    theme: "Too many ads",
    keywords: ["ads", "advert", "adverts", "pop-up", "popup", "pop up"],
    opportunity: "A clean, ad-light experience as the core wedge.",
  },
  {
    theme: "Confusing UX",
    keywords: ["confusing", "hard to use", "complicated", "not intuitive", "clunky", "difficult to", "overwhelming"],
    opportunity: "A simpler onboarding and a focused core loop.",
  },
  {
    theme: "Missing features",
    keywords: ["wish", "needs to", "should add", "missing", "can't", "cannot", "no way to", "would be nice", "please add"],
    opportunity: "Ship the most-requested missing capability as the headline feature.",
  },
  {
    theme: "Slow performance",
    keywords: ["slow", "laggy", "lag", "sluggish", "takes forever", "loading"],
    opportunity: "A snappy, lightweight build that wins on speed.",
  },
  {
    theme: "Accounts & sync",
    keywords: ["login", "log in", "sign in", "password", "sync", "logged out", "lost my data", "account"],
    opportunity: "Reliable accounts + dependable cross-device sync.",
  },
  {
    theme: "Family & sharing",
    keywords: ["family", "share", "sharing", "partner", "together", "group", "accountability"],
    opportunity: "A shared / accountability mode for households or groups.",
  },
];

const isNegative = (rating: number | null) => rating != null && rating <= 3;
const snippet = (t: string) => (t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t);

export function analyzePain(reviewsIn: PainReviewInput[]): PainAnalysis {
  const reviews = reviewsIn.filter((r) => r.text && r.text.trim().length > 0);
  const total = reviews.length;
  if (total === 0) return { clusters: [], score: null, sampleSize: 0 };

  const negativeTotal = reviews.filter((r) => isNegative(r.rating)).length;

  const clusters: PainCluster[] = [];
  for (const def of THEMES) {
    const matched = reviews.filter((r) => {
      const lc = r.text.toLowerCase();
      return def.keywords.some((k) => lc.includes(k));
    });
    if (matched.length === 0) continue;
    const negMatched = matched.filter((r) => isNegative(r.rating));
    // examples: prefer negative, shortest-first (most quotable)
    const examples = [...matched]
      .sort((a, b) => Number(isNegative(b.rating)) - Number(isNegative(a.rating)) || a.text.length - b.text.length)
      .slice(0, 3)
      .map((r) => snippet(r.text.trim()));
    clusters.push({
      theme: def.theme,
      frequency: matched.length,
      share: round2(matched.length / total),
      negativeShare: round2(matched.length ? negMatched.length / matched.length : 0),
      exampleReviews: examples,
      opportunity: def.opportunity,
    });
  }

  // Keep themes with real signal: ≥2 mentions or ≥5% of the sample.
  const floor = Math.max(2, Math.ceil(total * 0.05));
  const kept = clusters
    .filter((c) => c.frequency >= floor)
    .sort((a, b) => salience(b) - salience(a));

  if (total < MIN_PAIN_SAMPLE) {
    return { clusters: kept, score: null, sampleSize: total };
  }

  const negativeRate = negativeTotal / total;
  const topConcentration = kept.length ? kept[0]!.share : 0;
  const score = Math.round(100 * clamp01(0.55 * negativeRate + 0.45 * topConcentration));
  return { clusters: kept, score, sampleSize: total };
}

const salience = (c: PainCluster) => c.frequency * (0.5 + c.negativeShare);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

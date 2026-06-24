/**
 * find_similar_apps — the PURE scoring/classification/reranking core.
 *
 * No DB, no API, no LLM: given candidate apps already retrieved (by the API
 * service's multi-pass retrieval) plus the per-pass signals that surfaced each,
 * this module blends a deterministic similarity score, classifies the relation
 * (direct/adjacent/analogue), writes plain-language reasons, and ranks the set.
 *
 * Anchored on the `@kittie/types` contracts (`SimilarApp`, `SimilarityClass`,
 * `InterpretedIdea`, `Confidence`). Scores are deterministic by design — the
 * only optional LLM touch (phrasing reasons) lives in the API layer, never here.
 */
import type {
  AppListItem,
  Confidence,
  InterpretedIdea,
  SimilarApp,
  SimilarityClass,
  SimilarityMatchSignal,
} from "@kittie/types";

/* ────────────────────────── tokenization ────────────────────────── */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "your",
  "you", "my", "app", "apps", "application", "best", "free", "new", "get", "by",
  "is", "it", "this", "that", "ai", "based", "online", "mobile", "pro", "plus",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords and 1-char tokens, dedupe. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const t = raw.trim();
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/* ────────────────────────── interpretation ────────────────────────── */

/** Read a seed catalog app into structured search terms (observed). */
export function interpretFromApp(app: {
  title: string;
  category: string | null;
}): InterpretedIdea {
  return {
    summary: app.title,
    categories: app.category ? [app.category] : [],
    keywords: tokenize(app.title),
    kind: "observed",
  };
}

/**
 * Read a free-text idea into structured search terms (inferred). Categories are
 * the catalog facet names whose own tokens overlap the query (or that appear
 * verbatim in it) — a deterministic mapping, no model.
 */
export function interpretFromQuery(
  query: string,
  categoryNames: string[],
): InterpretedIdea {
  const keywords = tokenize(query);
  const kwSet = new Set(keywords);
  const qLower = query.toLowerCase();
  const categories: string[] = [];
  for (const name of categoryNames) {
    const nl = name.toLowerCase();
    const hit = qLower.includes(nl) || tokenize(name).some((t) => kwSet.has(t));
    if (hit && !categories.includes(name)) categories.push(name);
    if (categories.length >= 5) break;
  }
  return { summary: query.trim(), categories, keywords, kind: "inferred" };
}

/* ────────────────────────── scoring ────────────────────────── */

/**
 * What the retrieval passes recorded for one candidate app. The API service
 * fills this in; this module turns it into a scored `SimilarApp`.
 */
export interface SimilarCandidate {
  app: AppListItem;
  /** 0..1 FTS relevance (1 = top of the keyword-ranked list); 0 if not an FTS hit. */
  ftsScore: number;
  /** Surfaced by a category-peer pass for one of the idea's inferred categories. */
  categoryPeer: boolean;
  /** 0..1 review-topic/improvement-area overlap with the idea; 0 when not computed. */
  reviewTopicScore: number;
}

/** Deterministic blend weights per signal (sum = 1.0 → score naturally clamps to [0,1]). */
const WEIGHTS: Record<SimilarityMatchSignal, number> = {
  fts_keyword: 0.34,
  category_peer: 0.3,
  keyword_cluster: 0.22,
  review_topic: 0.14,
};

/** Token overlap of the idea's keywords against an app's title + category (0..1). */
export function keywordOverlap(keywords: string[], app: AppListItem): number {
  if (keywords.length === 0) return 0;
  const appTokens = new Set([
    ...tokenize(app.title),
    ...(app.category ? tokenize(app.category) : []),
  ]);
  if (appTokens.size === 0) return 0;
  let hits = 0;
  for (const k of keywords) if (appTokens.has(k)) hits++;
  return hits / keywords.length;
}

/**
 * Classify the relationship from the deterministic signals.
 * - `direct`   — same category AND a strong lexical match (head-on competitor).
 * - `adjacent` — same category OR a moderate lexical match (neighbouring).
 * - `analogue` — surfaced only by a weak/cross-domain signal (transferable).
 */
export function classifySimilarity(opts: {
  sameCategory: boolean;
  keywordOverlapScore: number;
  ftsScore: number;
  reviewTopicScore: number;
}): SimilarityClass {
  // `direct` leans on the IDF-weighted ftsScore: matching the rare, discriminative
  // term (a high ftsScore) signals a head-on competitor, whereas matching just one
  // of several query words (overlap 0.5) does not. Raw overlap only forces `direct`
  // when nearly ALL query terms match (≥0.67).
  const strong = opts.ftsScore >= 0.5 || opts.keywordOverlapScore >= 0.67;
  const moderate =
    opts.ftsScore >= 0.2 || opts.keywordOverlapScore >= 0.34 || opts.reviewTopicScore >= 0.3;
  if (opts.sameCategory && strong) return "direct";
  if (opts.sameCategory || moderate) return "adjacent";
  return "analogue";
}

/** Class ordering for the final sort: direct first, then adjacent, then analogue. */
const CLASS_ORDER: Record<SimilarityClass, number> = {
  direct: 0,
  adjacent: 1,
  analogue: 2,
};

/** Turn one candidate + the idea interpretation into a scored, reasoned `SimilarApp`. */
export function scoreSimilar(
  candidate: SimilarCandidate,
  interpreted: InterpretedIdea,
): SimilarApp {
  const { app, ftsScore, categoryPeer, reviewTopicScore } = candidate;
  const overlap = keywordOverlap(interpreted.keywords, app);
  const sameCategory =
    app.category != null && interpreted.categories.includes(app.category);

  const matchedVia: SimilarityMatchSignal[] = [];
  const reasons: string[] = [];
  let score = 0;

  if (ftsScore > 0) {
    matchedVia.push("fts_keyword");
    score += WEIGHTS.fts_keyword * ftsScore;
    reasons.push("Matches your search terms");
  }
  if (categoryPeer || sameCategory) {
    matchedVia.push("category_peer");
    score += WEIGHTS.category_peer * 1;
    if (app.category) reasons.push(`Same category: ${app.category}`);
  }
  if (overlap > 0) {
    matchedVia.push("keyword_cluster");
    score += WEIGHTS.keyword_cluster * overlap;
    const shared = sharedKeywords(interpreted.keywords, app);
    if (shared.length) reasons.push(`Shares keywords: ${shared.join(", ")}`);
  }
  if (reviewTopicScore > 0) {
    matchedVia.push("review_topic");
    score += WEIGHTS.review_topic * reviewTopicScore;
    reasons.push("Users report similar themes");
  }

  return {
    app,
    similarityScore: Math.min(1, Number(score.toFixed(4))),
    similarityClass: classifySimilarity({
      sameCategory,
      keywordOverlapScore: overlap,
      ftsScore,
      reviewTopicScore,
    }),
    similarityReasons: reasons.length ? reasons : ["Weak signal match"],
    matchedVia,
  };
}

function sharedKeywords(keywords: string[], app: AppListItem): string[] {
  const appTokens = new Set([
    ...tokenize(app.title),
    ...(app.category ? tokenize(app.category) : []),
  ]);
  return keywords.filter((k) => appTokens.has(k)).slice(0, 5);
}

/** Score every candidate, sort by class then score, and cap at `limit`. */
export function rankSimilar(
  candidates: SimilarCandidate[],
  interpreted: InterpretedIdea,
  limit: number,
): SimilarApp[] {
  return candidates
    .map((c) => scoreSimilar(c, interpreted))
    .sort((a, b) => {
      const byClass = CLASS_ORDER[a.similarityClass] - CLASS_ORDER[b.similarityClass];
      if (byClass !== 0) return byClass;
      const byScore = b.similarityScore - a.similarityScore;
      // Within a class, similarity leads; near-ties break on prominence (review
      // count) so real competitors surface above obscure 0-review namesakes.
      if (Math.abs(byScore) > 0.02) return byScore;
      return (b.app.reviewCount ?? 0) - (a.app.reviewCount ?? 0);
    })
    .slice(0, limit);
}

/* ────────────────────────── confidence + summary ────────────────────────── */

/** Confidence scaled to evidence: more competitors + more signals → higher, missing sources cap it. */
export function computeSimilarConfidence(
  results: SimilarApp[],
  missing: string[],
): Confidence {
  const reasons: string[] = [];
  let score = Math.min(0.9, 0.25 + results.length * 0.04);
  reasons.push(`${results.length} similar app(s) retrieved`);

  const multiSignal = results.filter((r) => r.matchedVia.length >= 2).length;
  if (multiSignal > 0) {
    score = Math.min(0.92, score + 0.05);
    reasons.push(`${multiSignal} matched on multiple signals`);
  }
  if (results.length === 0) {
    score = 0.1;
    reasons.push("no competitors surfaced — idea may be novel or under-indexed");
  }
  if (missing.length > 0) {
    score = Math.max(0.1, score - 0.1 * missing.length);
    reasons.push(`limited by unavailable sources: ${missing.join(", ")}`);
  }
  return { score: Number(score.toFixed(3)), reasons };
}

/** A one-paragraph, deterministic readout an external agent can act on. */
export function buildSimilarAgentSummary(
  interpreted: InterpretedIdea,
  results: SimilarApp[],
  missing: string[],
): string {
  const top = results[0];
  if (!top) {
    return `No similar apps found for "${interpreted.summary}". The idea may be novel, too niche, or under-indexed in the catalog.${
      missing.length ? ` Note: ${missing.join("; ")}.` : ""
    }`;
  }
  const counts: Record<SimilarityClass, number> = { direct: 0, adjacent: 0, analogue: 0 };
  for (const r of results) counts[r.similarityClass]++;
  const topRating = top.app.rating != null ? `, rated ${top.app.rating}` : "";
  return (
    `Found ${results.length} similar app(s) for "${interpreted.summary}": ` +
    `${counts.direct} direct, ${counts.adjacent} adjacent, ${counts.analogue} analogue. ` +
    `Closest competitor: "${top.app.title}" (${top.app.reviewCount.toLocaleString()} reviews${topRating}). ` +
    `Pass this set to validate_app_idea for a verdict, or trigger a teardown on any competitor.` +
    (missing.length ? ` Coverage gaps: ${missing.join("; ")}.` : "")
  );
}

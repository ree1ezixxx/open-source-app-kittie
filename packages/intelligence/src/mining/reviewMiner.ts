/* ============================================================
   Review miner — the niche opportunity map.

   The Rodrigue thesis: 1–2★ reviews across a whole niche tell you
   what to build. Every review was tagged ONCE at ingest by the
   classifier seam (sentiment + topics + improvement-areas); this
   module is the pure aggregation over those stored tags — no DB,
   no LLM, no classifier at mine time.

   Scoring is built so cross-app recurrence beats single-app volume:
   a complaint echoed across 3 tracked apps in the niche is a market
   gap, the same complaint piled onto 1 app is just that app's bug.
   ============================================================ */

/** A review row as already tagged by the classifier seam at ingest. */
export interface MinableReview {
  id: string;
  appId: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null;
  topics: string[];
  improvementAreas: string[];
  reviewedAt: Date;
}

export type ClusterKind = "complaint" | "request" | "praise";

/** One mined theme across the niche, with evidence reviews to cite. */
export interface MinedCluster {
  kind: ClusterKind;
  label: string;
  count: number;
  appCount: number;
  share: number;
  avgRating: number;
  score: number;
  evidenceReviewIds: string[];
}

/** The full mined view of a niche's review corpus. */
export interface NicheReport {
  totalReviews: number;
  appCount: number;
  clusters: MinedCluster[];
}

export interface MineOptions {
  evidencePerCluster?: number;
  minCount?: number;
  maxClusters?: number;
}

const DEFAULT_EVIDENCE_PER_CLUSTER = 5;
const DEFAULT_MIN_COUNT = 2;
const DEFAULT_MAX_CLUSTERS = 40;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Group reviews by label, deduping repeated labels within one review. */
function bucketByLabel(
  reviews: MinableReview[],
  labelsOf: (review: MinableReview) => string[],
): Map<string, MinableReview[]> {
  const buckets = new Map<string, MinableReview[]>();
  for (const review of reviews) {
    for (const label of new Set(labelsOf(review))) {
      const bucket = buckets.get(label);
      if (bucket) bucket.push(review);
      else buckets.set(label, [review]);
    }
  }
  return buckets;
}

/**
 * Worse-rated complaints matter more; praise is discounted toward its
 * rating; requests are taken at face value — a 5★ "wish it had X" weighs
 * the same as a 1★ one.
 */
function ratingWeight(kind: ClusterKind, avgRating: number): number {
  if (kind === "complaint") return clamp(3.5 - avgRating, 0.5, 3);
  if (kind === "praise") return avgRating / 5;
  return 1;
}

function buildCluster(
  kind: ClusterKind,
  label: string,
  members: MinableReview[],
  totalReviews: number,
  evidencePerCluster: number,
): MinedCluster {
  const count = members.length;
  const appCount = new Set(members.map((m) => m.appId)).size;
  const avgRating = members.reduce((sum, m) => sum + m.rating, 0) / count;
  const evidenceReviewIds = [...members]
    .sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime())
    .slice(0, evidencePerCluster)
    .map((m) => m.id);

  return {
    kind,
    label,
    count,
    appCount,
    share: count / totalReviews,
    avgRating,
    score: count * Math.log2(1 + appCount) * ratingWeight(kind, avgRating),
    evidenceReviewIds,
  };
}

/**
 * Mine a niche's already-tagged reviews into ranked theme clusters.
 *
 * Complaints cluster per topic over negative/mixed-sentiment or ≤2★
 * reviews; requests cluster per improvement area over ALL reviews;
 * praise clusters per topic over positive ≥4★ reviews. Score multiplies
 * volume by log-scaled app spread so recurrence across tracked apps
 * always beats one app's pile-on.
 */
export function mineNiche(
  reviews: MinableReview[],
  opts?: MineOptions,
): NicheReport {
  const evidencePerCluster =
    opts?.evidencePerCluster ?? DEFAULT_EVIDENCE_PER_CLUSTER;
  const minCount = opts?.minCount ?? DEFAULT_MIN_COUNT;
  const maxClusters = opts?.maxClusters ?? DEFAULT_MAX_CLUSTERS;

  const totalReviews = reviews.length;
  if (totalReviews === 0) {
    return { totalReviews: 0, appCount: 0, clusters: [] };
  }
  const appCount = new Set(reviews.map((r) => r.appId)).size;

  const complaintPool = reviews.filter(
    (r) =>
      r.sentiment === "negative" || r.sentiment === "mixed" || r.rating <= 2,
  );
  const praisePool = reviews.filter(
    (r) => r.sentiment === "positive" && r.rating >= 4,
  );

  const clusters: MinedCluster[] = [];
  for (const [label, members] of bucketByLabel(complaintPool, (r) => r.topics)) {
    clusters.push(
      buildCluster("complaint", label, members, totalReviews, evidencePerCluster),
    );
  }
  for (const [label, members] of bucketByLabel(
    reviews,
    (r) => r.improvementAreas,
  )) {
    clusters.push(
      buildCluster("request", label, members, totalReviews, evidencePerCluster),
    );
  }
  for (const [label, members] of bucketByLabel(praisePool, (r) => r.topics)) {
    clusters.push(
      buildCluster("praise", label, members, totalReviews, evidencePerCluster),
    );
  }

  return {
    totalReviews,
    appCount,
    clusters: clusters
      .filter((c) => c.count >= minCount)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxClusters),
  };
}

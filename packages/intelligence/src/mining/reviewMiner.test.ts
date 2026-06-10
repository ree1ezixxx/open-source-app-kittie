import { describe, expect, it } from "vitest";
import {
  mineNiche,
  type ClusterKind,
  type MinableReview,
  type NicheReport,
} from "./reviewMiner.js";

function day(n: number): Date {
  return new Date(Date.UTC(2026, 0, n));
}

interface FixtureReview {
  id: string;
  appId: string;
  rating: number;
  sentiment: MinableReview["sentiment"];
  topics?: string[];
  improvementAreas?: string[];
  day: number;
}

function review(f: FixtureReview): MinableReview {
  return {
    id: f.id,
    appId: f.appId,
    rating: f.rating,
    sentiment: f.sentiment,
    topics: f.topics ?? [],
    improvementAreas: f.improvementAreas ?? [],
    reviewedAt: day(f.day),
  };
}

function cluster(
  report: NicheReport,
  kind: ClusterKind,
  label: string,
): NicheReport["clusters"][number] {
  const found = report.clusters.find(
    (c) => c.kind === kind && c.label === label,
  );
  if (!found) throw new Error(`missing cluster ${kind}/${label}`);
  return found;
}

/* 21 reviews across 4 apps.
   - "Sync Issues": 6 complaints across 3 apps (the niche-wide gap).
   - "Crashes": 8 complaints all on app-d (one app's pile-on).
   - "Dark Mode": 3 requests including a 5★ wish.
   - "Onboarding": 2 praise reviews + a 3★ positive that must not count.
   - "Battery Drain": 1 complaint, below minCount. */
const fixture: MinableReview[] = [
  review({ id: "s1", appId: "app-a", rating: 1, sentiment: "negative", topics: ["Sync Issues"], day: 1 }),
  review({ id: "s2", appId: "app-a", rating: 2, sentiment: "negative", topics: ["Sync Issues"], day: 2 }),
  review({ id: "s3", appId: "app-b", rating: 1, sentiment: "negative", topics: ["Sync Issues"], day: 3 }),
  review({ id: "s4", appId: "app-b", rating: 2, sentiment: "mixed", topics: ["Sync Issues"], day: 4 }),
  review({ id: "s5", appId: "app-c", rating: 1, sentiment: "negative", topics: ["Sync Issues"], day: 5 }),
  review({ id: "s6", appId: "app-c", rating: 2, sentiment: "negative", topics: ["Sync Issues"], day: 6 }),
  review({ id: "c1", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 1 }),
  review({ id: "c2", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 2 }),
  review({ id: "c3", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 3 }),
  review({ id: "c4", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 4 }),
  review({ id: "c5", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 5 }),
  review({ id: "c6", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 6 }),
  review({ id: "c7", appId: "app-d", rating: 1, sentiment: "negative", topics: ["Crashes"], day: 7 }),
  review({ id: "c8", appId: "app-d", rating: 1, sentiment: null, topics: ["Crashes"], day: 8 }),
  review({ id: "dm1", appId: "app-a", rating: 5, sentiment: "positive", improvementAreas: ["Dark Mode"], day: 10 }),
  review({ id: "dm2", appId: "app-b", rating: 2, sentiment: "negative", improvementAreas: ["Dark Mode"], day: 11 }),
  review({ id: "dm3", appId: "app-c", rating: 2, sentiment: "negative", improvementAreas: ["Dark Mode"], day: 12 }),
  review({ id: "p1", appId: "app-a", rating: 5, sentiment: "positive", topics: ["Onboarding"], day: 13 }),
  review({ id: "p2", appId: "app-b", rating: 5, sentiment: "positive", topics: ["Onboarding"], day: 14 }),
  review({ id: "p3", appId: "app-c", rating: 3, sentiment: "positive", topics: ["Onboarding"], day: 15 }),
  review({ id: "bd1", appId: "app-c", rating: 1, sentiment: "negative", topics: ["Battery Drain"], day: 16 }),
];

describe("mineNiche", () => {
  it("ranks a 6-review/3-app complaint above an 8-review/1-app complaint", () => {
    const report = mineNiche(fixture);
    const sync = cluster(report, "complaint", "Sync Issues");
    const crashes = cluster(report, "complaint", "Crashes");

    expect(sync.count).toBeLessThan(crashes.count);
    expect(sync.appCount).toBe(3);
    expect(crashes.appCount).toBe(1);
    expect(sync.score).toBeGreaterThan(crashes.score);
    expect(report.clusters[0]?.label).toBe("Sync Issues");
  });

  it("computes score as count × log2(1 + appCount) × ratingWeight", () => {
    const report = mineNiche(fixture);

    expect(cluster(report, "complaint", "Sync Issues").score).toBe(
      6 * Math.log2(4) * 2,
    );
    expect(cluster(report, "complaint", "Crashes").score).toBe(
      8 * Math.log2(2) * 2.5,
    );
    expect(cluster(report, "request", "Dark Mode").score).toBe(
      3 * Math.log2(4) * 1,
    );
    expect(cluster(report, "praise", "Onboarding").score).toBe(
      2 * Math.log2(3) * 1,
    );
  });

  it("clamps the complaint rating weight at the 0.5 floor", () => {
    const mild = mineNiche([
      review({ id: "m1", appId: "app-a", rating: 5, sentiment: "mixed", topics: ["Search"], day: 1 }),
      review({ id: "m2", appId: "app-b", rating: 5, sentiment: "mixed", topics: ["Search"], day: 2 }),
    ]);
    expect(cluster(mild, "complaint", "Search").score).toBe(
      2 * Math.log2(3) * 0.5,
    );
  });

  it("draws requests from all reviews, including positive ones", () => {
    const report = mineNiche(fixture);
    const darkMode = cluster(report, "request", "Dark Mode");

    expect(darkMode.count).toBe(3);
    expect(darkMode.appCount).toBe(3);
    expect(darkMode.evidenceReviewIds).toContain("dm1");
  });

  it("excludes sub-4★ reviews from praise even when sentiment is positive", () => {
    const report = mineNiche(fixture);
    const onboarding = cluster(report, "praise", "Onboarding");

    expect(onboarding.count).toBe(2);
    expect(onboarding.avgRating).toBe(5);
    expect(onboarding.evidenceReviewIds).not.toContain("p3");
  });

  it("orders evidence by recency and caps it at evidencePerCluster", () => {
    const byDefault = mineNiche(fixture);
    expect(cluster(byDefault, "complaint", "Crashes").evidenceReviewIds).toEqual(
      ["c8", "c7", "c6", "c5", "c4"],
    );

    const capped = mineNiche(fixture, { evidencePerCluster: 2 });
    expect(cluster(capped, "complaint", "Crashes").evidenceReviewIds).toEqual([
      "c8",
      "c7",
    ]);
  });

  it("drops clusters below minCount", () => {
    const report = mineNiche(fixture);
    expect(
      report.clusters.find((c) => c.label === "Battery Drain"),
    ).toBeUndefined();

    const lenient = mineNiche(fixture, { minCount: 1 });
    expect(cluster(lenient, "complaint", "Battery Drain").count).toBe(1);
  });

  it("computes share and avgRating exactly", () => {
    const report = mineNiche(fixture);
    expect(report.totalReviews).toBe(21);
    expect(report.appCount).toBe(4);

    const sync = cluster(report, "complaint", "Sync Issues");
    expect(sync.share).toBe(6 / 21);
    expect(sync.avgRating).toBe(1.5);

    const darkMode = cluster(report, "request", "Dark Mode");
    expect(darkMode.share).toBe(3 / 21);
    expect(darkMode.avgRating).toBe(3);
  });

  it("caps the report at maxClusters after sorting by score", () => {
    const report = mineNiche(fixture, { maxClusters: 2 });
    expect(report.clusters.map((c) => c.label)).toEqual([
      "Sync Issues",
      "Crashes",
    ]);
  });

  it("returns an empty report for no reviews", () => {
    expect(mineNiche([])).toEqual({
      totalReviews: 0,
      appCount: 0,
      clusters: [],
    });
  });
});

import { describe, expect, it } from "vitest";
import type { Capture, FieldChange, WatchedFields } from "./capture.js";
import { captureChanges } from "./capture.js";

const PRIOR_AT = new Date("2026-06-01T00:00:00Z");
const CAPTURED_AT = new Date("2026-06-08T00:00:00Z");

function prior(fields: Partial<WatchedFields>): Capture {
  return { capturedAt: PRIOR_AT, fields };
}

function fresh(fields: Partial<WatchedFields>): Capture {
  return { capturedAt: CAPTURED_AT, fields };
}

function only(changes: FieldChange[]): FieldChange {
  expect(changes).toHaveLength(1);
  return changes[0]!;
}

describe("captureChanges", () => {
  it("returns an empty diff when every observed field is unchanged", () => {
    const fields: Partial<WatchedFields> = {
      title: "Kittie",
      description: "Track apps.",
      price: 3.99,
      category: "Productivity",
      contentRating: "4+",
      screenshotUrls: ["a.png", "b.png"],
      rating: 4.7,
      reviewCount: 120,
      chartRank: 34,
      revenueEstimate: 5000,
      downloadsEstimate: 20000,
    };
    expect(captureChanges(prior(fields), fresh({ ...fields }))).toEqual([]);
  });

  it("records text field changes verbatim with snake_case storage names", () => {
    const changes = captureChanges(
      prior({
        title: "Kittie",
        description: "Old copy.",
        category: "Productivity",
        contentRating: "4+",
      }),
      fresh({
        title: "Kittie Pro",
        description: "New copy.",
        category: "Utilities",
        contentRating: "12+",
      }),
    );
    expect(changes).toHaveLength(4);
    expect(changes.find((c) => c.field === "title")).toMatchObject({
      oldValue: "Kittie",
      newValue: "Kittie Pro",
    });
    expect(changes.find((c) => c.field === "description")).toMatchObject({
      oldValue: "Old copy.",
      newValue: "New copy.",
    });
    expect(changes.find((c) => c.field === "category")).toMatchObject({
      oldValue: "Productivity",
      newValue: "Utilities",
    });
    expect(changes.find((c) => c.field === "content_rating")).toMatchObject({
      oldValue: "4+",
      newValue: "12+",
    });
  });

  it("records exact numeric changes serialized via String(n)", () => {
    const changes = captureChanges(
      prior({ price: 2.99, revenueEstimate: 5000, downloadsEstimate: 20000 }),
      fresh({ price: 3.99, revenueEstimate: 6500, downloadsEstimate: 21000 }),
    );
    expect(changes).toHaveLength(3);
    expect(changes.find((c) => c.field === "price")).toMatchObject({
      oldValue: "2.99",
      newValue: "3.99",
    });
    expect(changes.find((c) => c.field === "revenue_estimate")).toMatchObject({
      oldValue: "5000",
      newValue: "6500",
    });
    expect(changes.find((c) => c.field === "downloads_estimate")).toMatchObject({
      oldValue: "20000",
      newValue: "21000",
    });
  });

  it("ignores rating jitter within epsilon", () => {
    expect(captureChanges(prior({ rating: 4.5 }), fresh({ rating: 4.504 }))).toEqual([]);
    expect(captureChanges(prior({ rating: 4.5 }), fresh({ rating: 4.496 }))).toEqual([]);
  });

  it("records rating moves beyond epsilon", () => {
    const change = only(captureChanges(prior({ rating: 4.5 }), fresh({ rating: 4.6 })));
    expect(change).toMatchObject({ field: "rating", oldValue: "4.5", newValue: "4.6" });
  });

  it("drops a review count decrease silently — cumulative metric noise", () => {
    expect(
      captureChanges(prior({ reviewCount: 120 }), fresh({ reviewCount: 90 })),
    ).toEqual([]);
  });

  it("records a review count increase", () => {
    const change = only(
      captureChanges(prior({ reviewCount: 120 }), fresh({ reviewCount: 180 })),
    );
    expect(change).toMatchObject({
      field: "review_count",
      oldValue: "120",
      newValue: "180",
    });
  });

  it("treats the same screenshot set in a different order as no change", () => {
    expect(
      captureChanges(
        prior({ screenshotUrls: ["a.png", "b.png", "c.png"] }),
        fresh({ screenshotUrls: ["c.png", "a.png", "b.png"] }),
      ),
    ).toEqual([]);
  });

  it("records a real screenshot set change as JSON arrays in original order", () => {
    const change = only(
      captureChanges(
        prior({ screenshotUrls: ["b.png", "a.png"] }),
        fresh({ screenshotUrls: ["c.png", "a.png", "b.png"] }),
      ),
    );
    expect(change).toMatchObject({
      field: "screenshot_urls",
      oldValue: '["b.png","a.png"]',
      newValue: '["c.png","a.png","b.png"]',
    });
  });

  it("skips fields undefined on either side — unobserved is never a change", () => {
    expect(captureChanges(prior({}), fresh({ title: "Kittie" }))).toEqual([]);
    expect(captureChanges(prior({ title: "Kittie" }), fresh({}))).toEqual([]);
    expect(captureChanges(prior({ chartRank: 34 }), fresh({ title: "Kittie" }))).toEqual(
      [],
    );
  });

  it("records null-to-value transitions on observed fields", () => {
    const entered = only(
      captureChanges(prior({ chartRank: null }), fresh({ chartRank: 34 })),
    );
    expect(entered).toMatchObject({
      field: "chart_rank",
      oldValue: null,
      newValue: "34",
    });

    const becamePaid = only(captureChanges(prior({ price: null }), fresh({ price: 3.99 })));
    expect(becamePaid).toMatchObject({ field: "price", oldValue: null, newValue: "3.99" });
  });

  it("records value-to-null transitions on observed fields", () => {
    const leftChart = only(
      captureChanges(prior({ chartRank: 34 }), fresh({ chartRank: null })),
    );
    expect(leftChart).toMatchObject({
      field: "chart_rank",
      oldValue: "34",
      newValue: null,
    });
  });

  it("treats null observed on both sides as no change", () => {
    expect(captureChanges(prior({ chartRank: null }), fresh({ chartRank: null }))).toEqual(
      [],
    );
    expect(captureChanges(prior({ title: null }), fresh({ title: null }))).toEqual([]);
  });

  it("gives each simultaneous change its own row with the shared timestamp pair", () => {
    const changes = captureChanges(
      prior({ title: "Kittie", price: null, chartRank: 80, reviewCount: 100 }),
      fresh({ title: "Kittie Pro", price: 3.99, chartRank: 12, reviewCount: 150 }),
    );
    expect(changes.map((c) => c.field).sort()).toEqual([
      "chart_rank",
      "price",
      "review_count",
      "title",
    ]);
    for (const change of changes) {
      expect(change.priorAt).toBe(PRIOR_AT);
      expect(change.capturedAt).toBe(CAPTURED_AT);
    }
  });
});

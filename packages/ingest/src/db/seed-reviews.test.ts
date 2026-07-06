import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SEED_CATEGORIES, seedCategoryReviews, storeAppIdOf, type SeedDeps } from "./seed-reviews.js";

function deps(over: Partial<SeedDeps> = {}): SeedDeps {
  return {
    db: {} as SeedDeps["db"],
    topChartedAppIds: vi.fn(async ({ category }) => [`apple:${category.length}01`, `apple:${category.length}02`, `apple:${category.length}03`]),
    reviewCountsByApp: vi.fn(async () => ({})),
    syncReviews: vi.fn(async () => 42),
    sleep: vi.fn(async () => {}),
    ...over,
  };
}

describe("storeAppIdOf", () => {
  it("strips the store prefix and passes bare ids through", () => {
    expect(storeAppIdOf("apple:570060128")).toBe("570060128");
    expect(storeAppIdOf("google:com.x.y")).toBe("com.x.y");
    expect(storeAppIdOf("570060128")).toBe("570060128");
  });
});

describe("seedCategoryReviews", () => {
  it("seeds every unreviewed app and reports per-category + totals", async () => {
    const d = deps();
    const report = await seedCategoryReviews(d, { categories: ["Education", "Finance"] });
    expect(report.categories).toHaveLength(2);
    expect(report.totals).toEqual({ resolved: 6, seeded: 6, skipped: 0, failed: 0, newReviews: 6 * 42 });
    expect(report.capRemaining).toBe(0);
    // sync received the STORE-native id, not the prefixed one
    expect((d.syncReviews as ReturnType<typeof vi.fn>).mock.calls.every(([id]) => !String(id).includes(":"))).toBe(true);
  });

  it("skips apps that already hold reviews (idempotent re-run = no-op)", async () => {
    const d = deps({
      reviewCountsByApp: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 5]))),
    });
    const report = await seedCategoryReviews(d, { categories: ["Education"] });
    expect(report.totals.seeded).toBe(0);
    expect(report.totals.skipped).toBe(3);
    expect(d.syncReviews).not.toHaveBeenCalled();
  });

  it("enforces the per-run cap and reports the remainder for resume", async () => {
    const report = await seedCategoryReviews(deps(), { categories: ["Education", "Finance"], maxAppsPerRun: 4 });
    expect(report.totals.seeded).toBe(4);
    expect(report.capRemaining).toBe(2);
  });

  it("counts per-app failures honestly without killing the run", async () => {
    const sync = vi.fn(async (id: string) => {
      if (id.endsWith("02")) throw new Error("store 429");
      return 10;
    });
    const report = await seedCategoryReviews(deps({ syncReviews: sync }), { categories: ["Education"] });
    expect(report.totals.failed).toBe(1);
    expect(report.totals.seeded).toBe(2);
    expect(report.totals.newReviews).toBe(20);
  });

  it("paces between apps via the injected sleep", async () => {
    const sleep = vi.fn(async () => {});
    await seedCategoryReviews(deps({ sleep }), { categories: ["Education"], gapMs: 999 });
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(999);
  });

  it("passes country/topN through and exposes sane defaults", async () => {
    const d = deps();
    await seedCategoryReviews(d, { categories: ["News"], country: "GB", topN: 7 });
    expect(d.topChartedAppIds).toHaveBeenCalledWith({ category: "News", country: "GB", store: "apple", topN: 7 });
    expect(DEFAULT_SEED_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });
});

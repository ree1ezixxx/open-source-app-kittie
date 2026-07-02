import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Point the API's getDb() singleton at a throwaway fixture DB BEFORE importing anything
// that calls it. getDb() reads DATABASE_URL lazily on first call, so setting it here wins.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "kittie-trends-perf-"));
const dbFile = path.join(tmpDir, "trends.db");
process.env.DATABASE_URL = `file:${dbFile}`;

const { createDb } = await import("@kittie/db");
const { getCategoryPulse } = await import("./trends-service.js");
const { searchAppCandidates } = await import("./app-query.js");

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "packages",
  "db",
  "drizzle",
);

const db = createDb(`file:${dbFile}`);

const LATEST = "2026-06-18";
const PRIOR = "2026-06-11"; // 7 days before → the growth-period prior

/** Apply every sqlite migration in order so the fixture has the REAL schema + indexes. */
async function applyMigrations(): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sqlText = readFileSync(path.join(migrationsDir, f), "utf8");
    for (const stmt of sqlText.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) await db.$client.execute(trimmed);
    }
  }
}

async function seedApp(opts: {
  id: string;
  category: string;
  latestReviews: number;
  priorReviews: number;
}): Promise<void> {
  const storeAppId = opts.id.split(":")[1] ?? opts.id;
  await db.$client.execute({
    sql: `INSERT INTO apps (id, store, store_app_id, title, developer, category, first_seen_at, last_snapshot_date)
          VALUES (?, 'apple', ?, ?, 'Dev', ?, 0, ?)`,
    args: [opts.id, storeAppId, `App ${opts.id}`, opts.category, LATEST],
  });
  for (const [date, reviews] of [
    [PRIOR, opts.priorReviews],
    [LATEST, opts.latestReviews],
  ] as const) {
    await db.$client.execute({
      sql: `INSERT INTO app_snapshots (id, app_id, snapshot_date, review_count, rating, chart_country, created_at)
            VALUES (?, ?, ?, ?, 4.5, 'US', 0)`,
      args: [`${opts.id}_${date}`, opts.id, date, reviews],
    });
  }
}

beforeAll(async () => {
  await applyMigrations();
  // Two categories so the candidate filter is exercised. Review counts are distinct so the
  // proxy order (review_count desc) is deterministic and assertable.
  await seedApp({ id: "apple:1", category: "Games", latestReviews: 5000, priorReviews: 1000 });
  await seedApp({ id: "apple:2", category: "Games", latestReviews: 3000, priorReviews: 2900 });
  await seedApp({ id: "apple:3", category: "Games", latestReviews: 1000, priorReviews: 100 });
  await seedApp({ id: "apple:4", category: "Finance", latestReviews: 9000, priorReviews: 8000 });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("trends candidate selection (perf fix #248)", () => {
  it("returns only the requested category, ordered by the review proxy — the seek branch", async () => {
    const pool = await searchAppCandidates({
      categories: "Games",
      countries: "US",
      sortBy: "growth",
      sortOrder: "desc",
      limit: 10,
    });
    expect(pool).not.toBeNull();
    // The Finance app (apple:4) must NOT leak in despite its far higher review count.
    expect(pool!.ids).toEqual(["apple:1", "apple:2", "apple:3"]);
    // The "X of Y" total comes from the apps-only fast count (the join count was the ~6-7s
    // cost this fix removes). country=US pins the default market, so it stays valid.
    expect(pool!.totalCount).toBe(3);
  });

  it("serves a category+US trends request with correct growth-ranked data", async () => {
    const res = await getCategoryPulse({
      category: "Games",
      country: "US",
      growthPeriod: "7d",
      limit: 10,
    });
    expect(res.responseType).toBe("trends");
    // apple:3 grew 100→1000 (10×) — the top mover — must outrank apple:1 (1000→5000, 5×)
    // and apple:2 (2900→3000, ~flat). This asserts the fast candidate paths didn't drop
    // the real top-growth app (correctness, not just speed).
    const ids = res.data.apps.map((a) => a.appId);
    expect(ids).toContain("apple:3");
    expect(ids).toContain("apple:1");
    expect(ids).not.toContain("apple:4"); // wrong category never appears
    expect(ids.indexOf("apple:3")).toBeLessThan(ids.indexOf("apple:2"));
  });

  it("completes a cold category+US trends request within a UI budget", async () => {
    // The regression this guards: pre-fix, a category+country=US load spent 13-30s in the
    // count(distinct) snapshot join + a sparse-category day-walk. On the tiny fixture it is
    // sub-ms; the assertion is a generous ceiling that would still catch a re-introduction
    // of an O(full-day-scan) path if the fixture grew.
    const t0 = performance.now();
    await getCategoryPulse({ category: "Games", country: "US", growthPeriod: "7d", limit: 10 });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

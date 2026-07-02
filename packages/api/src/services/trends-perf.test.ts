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
  /** Market the snapshots chart in (default US). */
  market?: string;
  /** Seed ONLY the prior-day snapshot — an app that didn't re-snapshot on the pinned
   *  complete day. The exact join count must EXCLUDE it; an apps-only count includes it. */
  priorOnly?: boolean;
}): Promise<void> {
  const storeAppId = opts.id.split(":")[1] ?? opts.id;
  await db.$client.execute({
    sql: `INSERT INTO apps (id, store, store_app_id, title, developer, category, first_seen_at, last_snapshot_date)
          VALUES (?, 'apple', ?, ?, 'Dev', ?, 0, ?)`,
    args: [opts.id, storeAppId, `App ${opts.id}`, opts.category, opts.priorOnly ? PRIOR : LATEST],
  });
  const days: Array<readonly [string, number]> = opts.priorOnly
    ? [[PRIOR, opts.priorReviews]]
    : [
        [PRIOR, opts.priorReviews],
        [LATEST, opts.latestReviews],
      ];
  for (const [date, reviews] of days) {
    await db.$client.execute({
      sql: `INSERT INTO app_snapshots (id, app_id, snapshot_date, review_count, rating, chart_country, created_at)
            VALUES (?, ?, ?, ?, 4.5, ?, 0)`,
      args: [`${opts.id}_${date}`, opts.id, date, reviews, opts.market ?? "US"],
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
  // The count-divergence sentinel: a Games app whose ONLY snapshot is on the prior day.
  // The exact join count for an explicit market must exclude it (no pinned-day row); the
  // no-country apps-only tolerance count includes it.
  await seedApp({ id: "apple:5", category: "Games", latestReviews: 0, priorReviews: 700, priorOnly: true });
  // A Games app charting ONLY in a non-default market (GB) — pins the explicit-market
  // count to the requested market's rows.
  await seedApp({ id: "apple:6", category: "Games", latestReviews: 400, priorReviews: 300, market: "GB" });
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
    // The Finance app (apple:4) must NOT leak in despite its far higher review count;
    // apple:5 has no pinned-day row and apple:6 charts only in GB — neither may appear.
    expect(pool!.ids).toEqual(["apple:1", "apple:2", "apple:3"]);
    // Explicit country=US keeps the EXACT join semantics: apple:5 (Games, but no
    // snapshot on the pinned day) and apple:6 (Games, GB-only) must NOT inflate the
    // total. 5 Games apps exist; only 3 have a US pinned-day row.
    expect(pool!.totalCount).toBe(3);
  });

  it("count equivalence: explicit US == exact join; no-country == apps tolerance; non-default market exact", async () => {
    const base = { categories: "Games", sortBy: "growth", sortOrder: "desc", limit: 10 } as const;
    // Explicit country=US → exact join count: excludes apple:5 (prior-day-only) and
    // apple:6 (GB-only). This is the case the pre-rework fast-path inflated to 5.
    const us = await searchAppCandidates({ ...base, countries: "US" });
    expect(us!.totalCount).toBe(3);
    // No country → the pre-existing apps-only tolerance count (documented <1% skew):
    // all 5 Games apps, including the one lacking a pinned-day snapshot.
    const noCountry = await searchAppCandidates({ ...base });
    expect(noCountry!.totalCount).toBe(5);
    expect(noCountry!.ids).toEqual(["apple:1", "apple:2", "apple:3"]); // rows still US-pinned
    // Non-default market → exact join count for THAT market's pinned-day rows only.
    const gb = await searchAppCandidates({ ...base, countries: "GB" });
    expect(gb!.totalCount).toBe(1);
    expect(gb!.ids).toEqual(["apple:6"]);
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

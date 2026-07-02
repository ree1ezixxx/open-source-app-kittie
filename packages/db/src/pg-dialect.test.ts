/**
 * Dual-dialect proof (#242): the Postgres schema generates + migrates cleanly
 * against an in-memory pglite instance (no live DB), and a basic CRUD round-trip
 * works through the pg drizzle instance. This exercises the Postgres path in CI
 * without provisioning Supabase.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, isPostgresUrl, type Db } from "./client.js";
import { coerceTimestamp, dbAll, dbGet, dbRun, dialectOf, isPostgres } from "./dialect.js";
import { countSnapshotDays, listIdeaCandidates } from "./queries/ideas.js";
import { appsFtsQuery, countAppIdsByText, ensureAppsFts, searchAppIds, toPgTsQuery } from "./queries/fts.js";
import * as schemaPg from "./schema.pg.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "pg");

/** Boot pglite and apply the generated pg migration SQL (drizzle's
 *  `--> statement-breakpoint` lines are `--` comments, so `exec` runs the whole file).
 *  `upTo` caps how many migration files are applied (default: all). */
async function freshDb(upTo = Infinity) {
  const pg = new PGlite();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .slice(0, upTo);
  for (const f of files) {
    await pg.exec(readFileSync(path.join(migrationsDir, f), "utf8"));
  }
  return drizzle(pg, { schema: schemaPg });
}

/** Raw-query escape hatch on the pglite drizzle handle. */
function rawClient(db: unknown) {
  return (db as { $client: { query: (s: string) => Promise<{ rows: unknown[] }> } }).$client;
}

describe("createDb pg guard", () => {
  it("detects postgres URLs", () => {
    expect(isPostgresUrl("postgres://x")).toBe(true);
    expect(isPostgresUrl("postgresql://x")).toBe(true);
    expect(isPostgresUrl("file:/tmp/x.db")).toBe(false);
    expect(isPostgresUrl(undefined)).toBe(false);
  });

  it("HARD-THROWS on postgres:// until the runtime is dialect-aware (#245)", () => {
    // The query layer is still SQLite-dialect — nobody should silently enable a
    // broken pg backend by pointing DATABASE_URL at Postgres.
    expect(() => createDb("postgres://user:pw@localhost:5432/kittie")).toThrow(/not production-ready/);
  });
});

describe("Postgres dialect (pglite)", () => {
  it("migrates the pg schema cleanly and all tables exist", async () => {
    const db = await freshDb();
    const { rows } = await db.$client.query<{ count: string }>(
      "select count(*)::text as count from information_schema.tables where table_schema = 'public'",
    );
    // 19 tables in the schema.
    expect(Number(rows[0]?.count)).toBe(19);
  });

  it("round-trips an app + snapshot (FK, timestamptz, boolean, real)", async () => {
    const db = await freshDb();
    const now = new Date("2026-07-02T00:00:00.000Z");

    await db.insert(schemaPg.apps).values({
      id: "apple:1",
      store: "apple",
      storeAppId: "1",
      title: "Focus Timer",
      developer: "Deep Work Labs",
      firstSeenAt: now,
    });
    await db.insert(schemaPg.appSnapshots).values({
      id: "snap:1",
      appId: "apple:1",
      snapshotDate: "2026-07-02",
      reviewCount: 100,
      rating: 4.8,
      isFirstMover: true,
      createdAt: now,
    });

    const app = await db.select().from(schemaPg.apps).where(eq(schemaPg.apps.id, "apple:1"));
    expect(app[0]?.title).toBe("Focus Timer");
    expect(app[0]?.firstSeenAt instanceof Date).toBe(true);

    const snap = await db.select().from(schemaPg.appSnapshots).where(eq(schemaPg.appSnapshots.appId, "apple:1"));
    expect(snap[0]?.rating).toBe(4.8);
    expect(snap[0]?.isFirstMover).toBe(true);
  });

  it("enforces the app FK on snapshots", async () => {
    const db = await freshDb();
    await expect(
      db.insert(schemaPg.appSnapshots).values({
        id: "snap:x",
        appId: "apple:missing",
        snapshotDate: "2026-07-02",
        reviewCount: 0,
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
  });
});

describe("dialect seam", () => {
  it("detects pg vs sqlite from the live handle", async () => {
    const pg = await freshDb();
    expect(dialectOf(pg)).toBe("postgres");
    expect(isPostgres(pg)).toBe(true);
  });

  it("dbAll/dbGet/dbRun route through pg .execute()", async () => {
    const pg = (await freshDb()) as unknown as Db;
    await dbRun(pg, sql`INSERT INTO apps (id, store, store_app_id, title, developer, first_seen_at)
      VALUES ('apple:1', 'apple', '1', 'Focus', 'Dev', now())`);
    const all = await dbAll<{ id: string }>(pg, sql`SELECT id FROM apps`);
    expect(all.map((r) => r.id)).toEqual(["apple:1"]);
    const one = await dbGet<{ id: string }>(pg, sql`SELECT id FROM apps LIMIT 1`);
    expect(one?.id).toBe("apple:1");
  });

  it("coerceTimestamp handles epoch-int, timestamptz-string, and Date", () => {
    // SQLite path: epoch seconds *1000.
    expect(coerceTimestamp(1_700_000_000)?.getTime()).toBe(1_700_000_000_000);
    // Postgres path: timestamptz string parses directly.
    const d = coerceTimestamp("2026-07-02 19:17:57+00");
    expect(d?.getUTCFullYear()).toBe(2026);
    // Passthrough + null.
    const now = new Date();
    expect(coerceTimestamp(now)).toBe(now);
    expect(coerceTimestamp(null)).toBeNull();
    expect(coerceTimestamp(undefined)).toBeNull();
  });
});

describe("query modules on Postgres (pglite)", () => {
  /** Seed one app + its latest snapshot for the idea-candidate / search tests. */
  async function seedApp(
    db: Db,
    opts: { id: string; title: string; developer?: string; reviews: number; released?: Date | null },
  ): Promise<void> {
    await dbRun(
      db,
      sql`INSERT INTO apps (id, store, store_app_id, title, developer, released_at, first_seen_at)
          VALUES (${opts.id}, 'apple', ${opts.id}, ${opts.title}, ${opts.developer ?? "Dev"},
                  ${opts.released ? opts.released.toISOString() : null}, now())`,
    );
    await dbRun(
      db,
      sql`INSERT INTO app_snapshots (id, app_id, snapshot_date, review_count, chart_country, created_at)
          VALUES (${`${opts.id}:2026-07-02`}, ${opts.id}, '2026-07-02', ${opts.reviews}, 'US', now())`,
    );
  }

  it("migration 0001 creates the search_tsv generated column + GIN index", async () => {
    const db = await freshDb();
    const col = await rawClient(db).query(
      "select data_type, is_generated from information_schema.columns where table_name = 'apps' and column_name = 'search_tsv'",
    );
    expect(col.rows).toEqual([{ data_type: "tsvector", is_generated: "ALWAYS" }]);
    const idx = await rawClient(db).query(
      "select indexdef from pg_indexes where tablename = 'apps' and indexname = 'apps_search_tsv_idx'",
    );
    expect(idx.rows.length).toBe(1);
    expect((idx.rows[0] as { indexdef: string }).indexdef).toMatch(/USING gin/i);
    // Still no FTS5-style shadow table on pg.
    const shadow = await rawClient(db).query(
      "select 1 from information_schema.tables where table_name = 'apps_fts'",
    );
    expect(shadow.rows.length).toBe(0);
  });

  it("ensureAppsFts creates search_tsv + GIN index on a pre-#244 pg database (idempotent)", async () => {
    // Only migration 0000 → the column doesn't exist yet.
    const db = (await freshDb(1)) as unknown as Db;
    const before = await rawClient(db).query(
      "select 1 from information_schema.columns where table_name = 'apps' and column_name = 'search_tsv'",
    );
    expect(before.rows.length).toBe(0);

    await ensureAppsFts(db);
    await ensureAppsFts(db); // idempotent — second run must not throw

    const col = await rawClient(db).query(
      "select is_generated from information_schema.columns where table_name = 'apps' and column_name = 'search_tsv'",
    );
    expect(col.rows).toEqual([{ is_generated: "ALWAYS" }]);
    const idx = await rawClient(db).query(
      "select 1 from pg_indexes where tablename = 'apps' and indexname = 'apps_search_tsv_idx'",
    );
    expect(idx.rows.length).toBe(1);

    // The generated column indexes rows inserted after ensure, with no triggers.
    await seedApp(db, { id: "apple:1", title: "Duolingo", reviews: 10 });
    expect(await searchAppIds(db, "duo", 10)).toEqual(["apple:1"]);
  });

  it("searchAppIds / countAppIdsByText use native tsvector search on pg (token-prefix parity with FTS5)", async () => {
    const db = (await freshDb()) as unknown as Db;
    await seedApp(db, { id: "apple:1", title: "Candy Crush Saga", reviews: 10 });
    await seedApp(db, { id: "apple:2", title: "Focus Timer", developer: "Deep Work", reviews: 10 });

    expect(await searchAppIds(db, "candy cru", 10)).toEqual(["apple:1"]); // multi-token prefix
    expect(await searchAppIds(db, "duo", 10)).toEqual([]); // prefix of nothing seeded
    expect(await searchAppIds(db, "deep", 10)).toEqual(["apple:2"]); // matches developer
    expect(await searchAppIds(db, "crush candy", 10)).toEqual(["apple:1"]); // order-independent (FTS5 parity)
    expect(await countAppIdsByText(db, "focus")).toBe(1);
    expect(await countAppIdsByText(db, "nonexistent")).toBe(0);

    // Proof it's the tsvector path (not LIKE): mid-word substrings do NOT match,
    // exactly like FTS5's token-prefix semantics on SQLite.
    expect(await searchAppIds(db, "rush", 10)).toEqual([]);
    expect(await countAppIdsByText(db, "rush")).toBe(0);
  });

  it("ranks by ts_rank (relevance), not insertion or id order", async () => {
    const db = (await freshDb()) as unknown as Db;
    // apple:1 sorts first by id, but apple:2's title mentions the term twice →
    // higher term frequency → higher ts_rank → first.
    await seedApp(db, { id: "apple:1", title: "Candy Land", reviews: 10 });
    await seedApp(db, { id: "apple:2", title: "Candy Candy", reviews: 10 });
    expect(await searchAppIds(db, "candy", 10)).toEqual(["apple:2", "apple:1"]);
    expect(await countAppIdsByText(db, "candy")).toBe(2);
  });

  it("appsFtsQuery fragments compose with joins/filters on pg (the API search-flow shape)", async () => {
    const db = (await freshDb()) as unknown as Db;
    await seedApp(db, { id: "apple:1", title: "Candy Crush Saga", reviews: 10 });
    await seedApp(db, { id: "apple:2", title: "Focus Timer", reviews: 10 });

    expect(toPgTsQuery("Candy Cru")).toBe("candy:* & cru:*");
    expect(toPgTsQuery("Pokémon")).toBe("pokemon:*"); // query-side diacritic fold
    expect(toPgTsQuery("Node.js")).toBe("node:* & js:*"); // joiner split
    expect(toPgTsQuery("!!!")).toBeNull();
    expect(appsFtsQuery(db, "!!!")).toBeNull();

    const fts = appsFtsQuery(db, "candy cru")!;
    expect(fts).not.toBeNull();
    // Same composition ftsCandidateIds/ftsCount use in the API's search flow.
    const rows = await dbAll<{ id: string }>(
      db,
      sql`SELECT apps.id AS id
      FROM ${fts.from}
      JOIN app_snapshots ON app_snapshots.app_id = apps.id
      WHERE ${fts.match} AND app_snapshots.review_count >= ${5}
      ORDER BY ${fts.rank}, apps.id`,
    );
    expect(rows.map((r) => r.id)).toEqual(["apple:1"]);
    const cnt = await dbGet<{ c: number }>(
      db,
      sql`SELECT count(distinct apps.id) AS c
      FROM ${fts.from}
      JOIN app_snapshots ON app_snapshots.app_id = apps.id
      WHERE ${fts.match} AND app_snapshots.review_count >= ${5}`,
    );
    expect(Number(cnt?.c ?? 0)).toBe(1);
  });

  it("empty / garbage queries behave honestly (no throw, no rows)", async () => {
    const db = (await freshDb()) as unknown as Db;
    await seedApp(db, { id: "apple:1", title: "Candy Crush Saga", reviews: 10 });
    expect(await searchAppIds(db, "", 10)).toEqual([]);
    expect(await searchAppIds(db, "  ", 10)).toEqual([]);
    expect(await searchAppIds(db, "!!! --- ***", 10)).toEqual([]); // no usable token
    expect(await searchAppIds(db, "'; drop table apps; --", 10)).toEqual([]); // tokenizer strips metachars → 'drop table apps' terms
    expect(await countAppIdsByText(db, "")).toBe(0);
    expect(await countAppIdsByText(db, "!!!")).toBe(0);
    // Table survived the hostile query.
    const t = await rawClient(db).query("select count(*)::int as c from apps");
    expect((t.rows[0] as { c: number }).c).toBe(1);
  });

  it("listIdeaCandidates coerces released_at timestamptz → Date (not epoch*1000)", async () => {
    const db = (await freshDb()) as unknown as Db;
    const released = new Date("2020-06-15T00:00:00.000Z");
    await seedApp(db, { id: "apple:1", title: "Idea Source", reviews: 100, released });

    const cands = await listIdeaCandidates(db, 50);
    expect(cands.length).toBe(1);
    expect(cands[0]?.appId).toBe("apple:1");
    // The break this fixes: epoch*1000 on a timestamptz string → Invalid Date.
    expect(cands[0]?.releasedAt instanceof Date).toBe(true);
    expect(cands[0]?.releasedAt?.getUTCFullYear()).toBe(2020);
    expect(cands[0]?.reviewCount).toBe(100);
  });

  it("listIdeaCandidates respects the review floor", async () => {
    const db = (await freshDb()) as unknown as Db;
    await seedApp(db, { id: "apple:1", title: "Low", reviews: 10 });
    await seedApp(db, { id: "apple:2", title: "High", reviews: 200 });
    const cands = await listIdeaCandidates(db, 50);
    expect(cands.map((c) => c.appId)).toEqual(["apple:2"]);
  });

  it("countSnapshotDays works on pg", async () => {
    const db = (await freshDb()) as unknown as Db;
    await seedApp(db, { id: "apple:1", title: "A", reviews: 100 });
    await dbRun(
      db,
      sql`INSERT INTO app_snapshots (id, app_id, snapshot_date, review_count, chart_country, created_at)
          VALUES ('apple:1:2026-07-01', 'apple:1', '2026-07-01', 90, 'US', now())`,
    );
    expect(await countSnapshotDays(db)).toBe(2);
  });
});

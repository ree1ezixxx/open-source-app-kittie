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
import { countAppIdsByText, ensureAppsFts, searchAppIds } from "./queries/fts.js";
import * as schemaPg from "./schema.pg.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "pg");

/** Boot pglite and apply the generated pg migration SQL (drizzle's
 *  `--> statement-breakpoint` lines are `--` comments, so `exec` runs the whole file). */
async function freshDb() {
  const pg = new PGlite();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await pg.exec(readFileSync(path.join(migrationsDir, f), "utf8"));
  }
  return drizzle(pg, { schema: schemaPg });
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

  it("ensureAppsFts no-ops on pg (FTS5 is SQLite-only)", async () => {
    const db = (await freshDb()) as unknown as Db;
    await expect(ensureAppsFts(db)).resolves.toBeUndefined();
    // No apps_fts virtual table should have been created.
    const { rows } = await (db as unknown as { $client: { query: (s: string) => Promise<{ rows: unknown[] }> } }).$client.query(
      "select 1 from information_schema.tables where table_name = 'apps_fts'",
    );
    expect(rows.length).toBe(0);
  });

  it("searchAppIds / countAppIdsByText fall back to LIKE on pg", async () => {
    const db = (await freshDb()) as unknown as Db;
    await seedApp(db, { id: "apple:1", title: "Candy Crush Saga", reviews: 10 });
    await seedApp(db, { id: "apple:2", title: "Focus Timer", developer: "Deep Work", reviews: 10 });

    expect(await searchAppIds(db, "candy cru", 10)).toEqual(["apple:1"]);
    expect(await searchAppIds(db, "deep", 10)).toEqual(["apple:2"]); // matches developer
    expect(await searchAppIds(db, "", 10)).toEqual([]);
    expect(await countAppIdsByText(db, "focus")).toBe(1);
    expect(await countAppIdsByText(db, "nonexistent")).toBe(0);
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

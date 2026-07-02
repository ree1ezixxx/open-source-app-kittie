/**
 * Dialect proof for carry-forward on Postgres (#245).
 *
 * carry-forward.ts is one of the modules the #242 review flagged as SQLite-only:
 * it used `db.all()/.run()` (pg has only `.execute()`), `INSERT OR IGNORE`
 * (pg: `ON CONFLICT DO NOTHING`), and wrote a bare epoch int into what is now a
 * `timestamptz` column. This test runs the REAL `carryForwardSnapshots` against an
 * in-memory pglite Postgres, migrated with the generated pg schema, and asserts the
 * carry-forward copies the prior day forward, is idempotent on re-run, and writes a
 * sane `timestamptz` (not a 1970 epoch-int).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import type { Db } from "@kittie/db";
import { describe, expect, it } from "vitest";
import { carryForwardSnapshots } from "./carry-forward.js";

// The pg migrations live in the db package (drizzle/pg). Resolve relative to this file.
const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "db",
  "drizzle",
  "pg",
);

async function freshPgDb(): Promise<Db> {
  const pg = new PGlite();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await pg.exec(readFileSync(path.join(migrationsDir, f), "utf8"));
  }
  // Cast to Db: the pg drizzle handle is dialect-routed by the seam at runtime.
  return drizzle(pg) as unknown as Db;
}

/** Seed one app + one snapshot on `date` via raw SQL (schema-agnostic). */
async function seedSnapshot(
  db: Db,
  opts: { appId: string; date: string; reviews: number; country?: string },
): Promise<void> {
  const cc = opts.country ?? "US";
  const created = new Date("2026-07-01T00:00:00.000Z").toISOString();
  await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    sql`INSERT INTO apps (id, store, store_app_id, title, developer, first_seen_at)
        VALUES (${opts.appId}, 'apple', ${opts.appId}, 'Seed App', 'Seed Dev', ${created}::timestamptz)
        ON CONFLICT (id) DO NOTHING`,
  );
  const snapId = cc === "US" ? `${opts.appId}:${opts.date}` : `${opts.appId}:${opts.date}:${cc}`;
  await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    sql`INSERT INTO app_snapshots (id, app_id, snapshot_date, review_count, chart_country, created_at)
        VALUES (${snapId}, ${opts.appId}, ${opts.date}, ${opts.reviews}, ${cc}, ${created}::timestamptz)`,
  );
}

describe("carryForwardSnapshots on Postgres (pglite)", () => {
  it("copies the prior full day forward to today", async () => {
    const db = await freshPgDb();
    await seedSnapshot(db, { appId: "apple:1", date: "2026-07-01", reviews: 100 });
    await seedSnapshot(db, { appId: "apple:2", date: "2026-07-01", reviews: 50 });

    const res = await carryForwardSnapshots(db, { snapshotDate: "2026-07-02", countries: ["US"] });
    expect(res.carried).toBe(2);
    expect(res.countries).toEqual(["US"]);

    const { rows } = await (db as unknown as { $client: { query: (s: string) => Promise<{ rows: { c: string }[] }> } }).$client.query(
      "select count(*)::text as c from app_snapshots where snapshot_date = '2026-07-02'",
    );
    expect(Number(rows[0]?.c)).toBe(2);
  });

  it("is idempotent — a second run inserts nothing (ON CONFLICT DO NOTHING)", async () => {
    const db = await freshPgDb();
    await seedSnapshot(db, { appId: "apple:1", date: "2026-07-01", reviews: 100 });

    const first = await carryForwardSnapshots(db, { snapshotDate: "2026-07-02", countries: ["US"] });
    expect(first.carried).toBe(1);
    const second = await carryForwardSnapshots(db, { snapshotDate: "2026-07-02", countries: ["US"] });
    expect(second.carried).toBe(0);
  });

  it("writes a real timestamptz created_at (not a 1970 epoch-int)", async () => {
    const db = await freshPgDb();
    await seedSnapshot(db, { appId: "apple:1", date: "2026-07-01", reviews: 100 });
    await carryForwardSnapshots(db, { snapshotDate: "2026-07-02", countries: ["US"] });

    const { rows } = await (
      db as unknown as { $client: { query: (s: string) => Promise<{ rows: { created_at: string }[] }> } }
    ).$client.query("select created_at from app_snapshots where snapshot_date = '2026-07-02' limit 1");
    const carried = new Date(rows[0]!.created_at);
    // A bare epoch-int written into timestamptz would land in 1970; assert it's recent.
    expect(carried.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it("no prior day → carries nothing", async () => {
    const db = await freshPgDb();
    // Only today's row exists; nothing strictly before it.
    await seedSnapshot(db, { appId: "apple:1", date: "2026-07-02", reviews: 100 });
    const res = await carryForwardSnapshots(db, { snapshotDate: "2026-07-02", countries: ["US"] });
    expect(res.carried).toBe(0);
  });
});

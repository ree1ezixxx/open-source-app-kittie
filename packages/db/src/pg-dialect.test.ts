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
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
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

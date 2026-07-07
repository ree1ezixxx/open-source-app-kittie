/**
 * Cross-dialect FTS parity (#244 AC1): the SAME seeded catalog is searched
 * through BOTH engines — SQLite FTS5 (`apps_fts`, unicode61) and Postgres
 * tsvector (`apps.search_tsv`, pglite) — and every query must return the
 * IDENTICAL result set. This pins the two review-named divergence classes:
 *   - diacritics: unicode61 folds "Pokémon" → pokemon; the pg side must fold
 *     the document AND the query the same way (fts-normalize.ts).
 *   - compound tokens: unicode61 splits "Node.js"/"dev@node.io" into words;
 *     pg's default parser would keep them as single host/email lexemes unless
 *     the joiners are folded to spaces in the document expression.
 * Result sets are compared order-insensitively (bm25 vs ts_rank tie orders may
 * legitimately differ); membership and counts must be identical.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client.js";
import { dbRun } from "./dialect.js";
import { countAppIdsByText, ensureAppsFts, searchAppIds } from "./queries/fts.js";
import * as schemaPg from "./schema.pg.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "pg");

/** The shared fixture: names chosen to exercise diacritics (folding and
 *  non-folding), compound joiners, and plain ASCII controls. */
const FIXTURE: Array<{ id: string; title: string; developer: string }> = [
  { id: "apple:pokemon", title: "Pokémon GO", developer: "Niantic, Inc." },
  { id: "apple:beyonce", title: "Beyoncé Official", developer: "Parkwood Entertainment" },
  { id: "apple:cafe", title: "Café Timer", developer: "naïve labs" },
  { id: "apple:senor", title: "Señor Über", developer: "Ýmir Software" },
  { id: "apple:node", title: "Node.js Tools", developer: "dev@node.io" },
  { id: "apple:candy", title: "Candy Crush Saga", developer: "King" },
  { id: "apple:duo", title: "Duolingo", developer: "Duolingo" },
  // ø has NO canonical decomposition: unicode61 does NOT fold it (probed), so
  // neither does our map — preserved identically on both engines.
  { id: "apple:soren", title: "Søren Notes", developer: "Nordisk Apps" },
];

/** Queries asserted for identical result sets across both engines. */
const PARITY_QUERIES = [
  // Diacritic folding, both directions (ASCII query ↔ accented title, accented query).
  "pokemon",
  "Pokémon",
  "poke",
  "beyonce",
  "Beyoncé",
  "cafe",
  "café",
  "naive",
  "senor",
  "uber",
  "ymir",
  // Non-folding ø: self-query matches, ASCII query misses — on BOTH engines.
  "Søren",
  "soren",
  // Compound tokens (host/email-shaped).
  "node.js",
  "node js",
  "node",
  "js",
  "dev@node.io",
  "node.io",
  // Plain token-prefix controls.
  "candy cru",
  "crush candy",
  "duo",
  "niantic",
  // Mid-word substring must miss on both (token-prefix, not LIKE).
  "rush",
  "okemon",
  // Empty / garbage.
  "",
  "   ",
  "!!! --- ***",
] as const;

let sqliteDb: Db;
let pgDb: Db;
let tmpDir: string;

beforeAll(async () => {
  // SQLite engine: real libsql db + the production ensureAppsFts (FTS5 + triggers).
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "kittie-fts-parity-"));
  sqliteDb = createDb(`file:${path.join(tmpDir, "parity.db")}`);
  await dbRun(
    sqliteDb,
    sql`CREATE TABLE apps (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      store_app_id TEXT NOT NULL,
      title TEXT NOT NULL,
      developer TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL
    )`,
  );
  await ensureAppsFts(sqliteDb); // FTS5 vtable + triggers (before seed → triggers index the rows)

  // Postgres engine: pglite + generated migrations (incl. 0001 search_tsv + GIN).
  const pg = new PGlite();
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(path.join(migrationsDir, f), "utf8"));
  }
  pgDb = drizzle(pg, { schema: schemaPg }) as unknown as Db;
  await ensureAppsFts(pgDb); // must be a no-op on an already-migrated db

  for (const app of FIXTURE) {
    await dbRun(
      sqliteDb,
      sql`INSERT INTO apps (id, store, store_app_id, title, developer, first_seen_at)
          VALUES (${app.id}, 'apple', ${app.id}, ${app.title}, ${app.developer}, 1700000000)`,
    );
    await dbRun(
      pgDb,
      sql`INSERT INTO apps (id, store, store_app_id, title, developer, first_seen_at)
          VALUES (${app.id}, 'apple', ${app.id}, ${app.title}, ${app.developer}, now())`,
    );
  }
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("FTS parity: SQLite FTS5 vs Postgres tsvector", () => {
  for (const q of PARITY_QUERIES) {
    it(`query ${JSON.stringify(q)} returns the same result set on both engines`, async () => {
      const [sqliteIds, pgIds, sqliteCount, pgCount] = await Promise.all([
        searchAppIds(sqliteDb, q, 50),
        searchAppIds(pgDb, q, 50),
        countAppIdsByText(sqliteDb, q),
        countAppIdsByText(pgDb, q),
      ]);
      expect([...pgIds].sort()).toEqual([...sqliteIds].sort());
      expect(pgCount).toBe(sqliteCount);
    });
  }

  it("sanity: the fixture queries actually hit (parity is not vacuous)", async () => {
    // Diacritic fold, ASCII → accented title.
    expect(await searchAppIds(sqliteDb, "pokemon", 50)).toEqual(["apple:pokemon"]);
    expect(await searchAppIds(pgDb, "pokemon", 50)).toEqual(["apple:pokemon"]);
    // Accented query → accented title.
    expect(await searchAppIds(pgDb, "Beyoncé", 50)).toEqual(["apple:beyonce"]);
    // Compound title matched by word-split query.
    expect(await searchAppIds(pgDb, "node js", 50)).toEqual(["apple:node"]);
    // Compound query matched against compound developer.
    expect(await searchAppIds(pgDb, "dev@node.io", 50)).toEqual(["apple:node"]);
    // Non-folding ø: self-consistent hit, ASCII miss — both engines.
    expect(await searchAppIds(pgDb, "Søren", 50)).toEqual(["apple:soren"]);
    expect(await searchAppIds(pgDb, "soren", 50)).toEqual([]);
    expect(await searchAppIds(sqliteDb, "soren", 50)).toEqual([]);
  });

  it("parity holds for rows UPDATED after indexing (trigger vs generated column sync)", async () => {
    await dbRun(sqliteDb, sql`UPDATE apps SET title = 'Métro Zürich' WHERE id = ${"apple:duo"}`);
    await dbRun(pgDb, sql`UPDATE apps SET title = 'Métro Zürich' WHERE id = ${"apple:duo"}`);
    for (const q of ["metro", "zurich", "Métro", "duo"]) {
      const [s, p] = await Promise.all([searchAppIds(sqliteDb, q, 50), searchAppIds(pgDb, q, 50)]);
      expect([...p].sort()).toEqual([...s].sort());
    }
    expect(await searchAppIds(pgDb, "zurich", 50)).toEqual(["apple:duo"]); // not vacuous
  });
});

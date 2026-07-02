import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import * as schemaPg from "./schema.pg.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const defaultDbPath = path.join(repoRoot, "data", "kittie.db");

/**
 * One driver for both worlds: a local `file:` SQLite database in dev, the
 * hosted Turso replica (libsql://…) for the always-on sweep runner and any
 * deployed reader. Selection is by env: TURSO_DATABASE_URL wins, then
 * DATABASE_URL, then the repo-local file.
 */
/** Relative file: URLs resolve against the repo root, not the process cwd. */
function absolutize(url: string): string {
  if (!url.startsWith("file:")) return url;
  const p = url.slice("file:".length);
  return `file:${path.isAbsolute(p) ? p : path.resolve(repoRoot, p)}`;
}

/** A `postgres://` / `postgresql://` URL selects the Postgres (Supabase/Neon)
 *  driver; anything else stays on libsql/SQLite as before. */
export function isPostgresUrl(url: string | undefined): boolean {
  return !!url && /^postgres(ql)?:\/\//i.test(url);
}

export function createDb(databaseUrl?: string): Db {
  const rawUrl =
    databaseUrl ?? process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? `file:${defaultDbPath}`;

  // Postgres path (prod). Same query interface; the pg drizzle instance is
  // structurally compatible with the canonical `Db`, so consumers are unchanged.
  // NOTE: SQLite FTS5 (queries/fts.ts) has no Postgres equivalent yet — Postgres
  // full-text search (tsvector/pg_trgm) is a follow-up; see docs/schema-requests.md.
  if (isPostgresUrl(rawUrl)) {
    const sqlClient = postgres(rawUrl, { max: 10 });
    return drizzlePg(sqlClient, { schema: schemaPg }) as unknown as Db;
  }

  const url = absolutize(rawUrl);

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Per-connection pragma; journal_mode=WAL is persisted in the file itself.
  // Remote Turso manages its own durability settings and rejects pragmas.
  if (url.startsWith("file:")) {
    void client.execute("PRAGMA foreign_keys = ON").catch(() => {});
    // The out-of-process snapshot worker (ADR 0008) writes the same file while the
    // API reads/writes — including the once-daily carry-forward's large bulk insert.
    // Without a busy timeout a contended connection throws SQLITE_BUSY immediately
    // (it crashed the API). Wait-and-retry for up to 15s instead.
    void client.execute("PRAGMA busy_timeout = 15000").catch(() => {});
  }

  return drizzle(client, { schema });
}

/**
 * Canonical DB handle type = the libsql/SQLite drizzle instance. The Postgres
 * driver is cast to this at the boundary (dual-dialect port, #242) so the ~20
 * query modules and every consumer stay unchanged across dialects.
 */
export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

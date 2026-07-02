import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

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

  // Postgres path. The DDL mirror (schema.pg.ts) is proven against pglite, but
  // the RUNTIME query layer is not yet Postgres-safe: ~20 query modules call
  // SQLite-session-only `.all()/.get()/.run()` (pg exposes only `.execute()`),
  // `carry-forward.ts` uses `INSERT OR IGNORE` + epoch-int timestamps, FTS5 has
  // no pg equivalent, and some readers coerce `epoch*1000`. Making those
  // dialect-aware is the follow-up (#245); FTS specifically is #244. Until then
  // the pg branch is HARD-GUARDED so nobody enables a silently-broken backend by
  // setting DATABASE_URL=postgres:// in production.
  if (isPostgresUrl(rawUrl)) {
    throw new Error(
      "Postgres backend is not production-ready yet: the schema mirrors to Postgres " +
        "(proven via pglite) but the query layer is still SQLite-dialect. Track #245 " +
        "(dialect-aware queries) + #244 (pg FTS) before enabling DATABASE_URL=postgres://.",
    );
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

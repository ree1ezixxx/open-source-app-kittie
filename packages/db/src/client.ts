import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
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

export function createDb(databaseUrl?: string) {
  const url = absolutize(
    databaseUrl ??
      process.env.TURSO_DATABASE_URL ??
      process.env.DATABASE_URL ??
      `file:${defaultDbPath}`,
  );

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Per-connection pragma; journal_mode=WAL is persisted in the file itself.
  // Remote Turso manages its own durability settings and rejects pragmas.
  if (url.startsWith("file:")) {
    void client.execute("PRAGMA foreign_keys = ON").catch(() => {});
  }

  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

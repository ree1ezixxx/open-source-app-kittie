import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const defaultDbPath = path.join(repoRoot, "data", "kittie.db");

export function createDb(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? `file:${defaultDbPath}`;
  const dbPath = url.replace(/^file:/, "");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

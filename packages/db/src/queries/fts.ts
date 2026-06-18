import { sql } from "drizzle-orm";
import type { Db } from "../client.js";

/**
 * Full-text search over app title + developer (FTS5). Replaces the leading-wildcard
 * `LIKE '%q%'` scan that full-scanned ~1.1M rows on every keystroke (~20s). The virtual
 * table stays in sync via triggers on `apps`, so search is always current.
 *
 * Token-prefix semantics: "duo" matches "Duolingo", "candy cru" matches "Candy Crush".
 * Description is intentionally not indexed — search is by app name / developer (matching
 * the source-of-truth), and indexing 1.1M descriptions would multiply the DB size.
 */

/** Build an FTS5 MATCH expression: each token becomes a prefix term, AND-combined.
 *  "Candy Cru" → `candy* cru*`. Returns null when the query has no usable token. */
export function toFtsMatch(query: string): string | null {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}*`).join(" ");
}

/** Create the apps_fts virtual table + sync triggers, and backfill once if empty. Idempotent. */
export async function ensureAppsFts(db: Db): Promise<void> {
  await db.run(
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS apps_fts USING fts5(app_id UNINDEXED, title, developer, tokenize='unicode61')`,
  );
  await db.run(sql`CREATE TRIGGER IF NOT EXISTS apps_fts_ai AFTER INSERT ON apps BEGIN
    INSERT INTO apps_fts(app_id, title, developer) VALUES (new.id, new.title, new.developer);
  END`);
  await db.run(sql`CREATE TRIGGER IF NOT EXISTS apps_fts_au AFTER UPDATE OF title, developer ON apps BEGIN
    UPDATE apps_fts SET title = new.title, developer = new.developer WHERE app_id = new.id;
  END`);
  await db.run(sql`CREATE TRIGGER IF NOT EXISTS apps_fts_ad AFTER DELETE ON apps BEGIN
    DELETE FROM apps_fts WHERE app_id = old.id;
  END`);
  // Backfill once, atomically. BEGIN IMMEDIATE serialises concurrent boots: if two API
  // instances run against the same DB, the second blocks until the first commits, then
  // sees a non-empty table and skips. Without it both could see count==0 and insert every
  // app — FTS5 has no unique key, so search would then return every result twice.
  await db.transaction(
    async (tx) => {
      const row = await tx.get<{ c: number }>(sql`SELECT count(*) AS c FROM apps_fts`);
      if ((row?.c ?? 0) === 0) {
        await tx.run(sql`INSERT INTO apps_fts(app_id, title, developer) SELECT id, title, developer FROM apps`);
      }
    },
    { behavior: "immediate" },
  );
}

/** App ids whose title/developer match the text, most-relevant first, capped. */
export async function searchAppIds(db: Db, query: string, limit: number): Promise<string[]> {
  const match = toFtsMatch(query);
  if (!match) return [];
  const rows = await db.all<{ app_id: string }>(
    sql`SELECT app_id FROM apps_fts WHERE apps_fts MATCH ${match} ORDER BY rank LIMIT ${limit}`,
  );
  return rows.map((r) => r.app_id);
}

/** Total apps matching the text — the "X of Y" count for a search. */
export async function countAppIdsByText(db: Db, query: string): Promise<number> {
  const match = toFtsMatch(query);
  if (!match) return 0;
  const row = await db.get<{ c: number }>(sql`SELECT count(*) AS c FROM apps_fts WHERE apps_fts MATCH ${match}`);
  return row?.c ?? 0;
}

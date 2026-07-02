import { sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { dbAll, dbGet, dbRun, isPostgres } from "../dialect.js";

/**
 * Full-text search over app title + developer (FTS5). Replaces the leading-wildcard
 * `LIKE '%q%'` scan that full-scanned ~1.1M rows on every keystroke (~20s). The virtual
 * table stays in sync via triggers on `apps`, so search is always current.
 *
 * Token-prefix semantics: "duo" matches "Duolingo", "candy cru" matches "Candy Crush".
 * Description is intentionally not indexed — search is by app name / developer (matching
 * the source-of-truth), and indexing 1.1M descriptions would multiply the DB size.
 *
 * DIALECT (#245): FTS5 is SQLite-only — the virtual table, sync triggers, and `MATCH`
 * operator have no Postgres equivalent. On pg these functions no-op / fall back to a
 * portable `LIKE` scan so search still returns correct (if slower) results; native pg
 * full-text search is tracked separately (#244). SQLite keeps the fast FTS5 path.
 */

/** Build an FTS5 MATCH expression: each token becomes a prefix term, AND-combined.
 *  "Candy Cru" → `candy* cru*`. Returns null when the query has no usable token. */
export function toFtsMatch(query: string): string | null {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}*`).join(" ");
}

/** Tokens for the portable pg fallback: lowercased alnum runs (no `*` suffix). */
function ftsTokens(query: string): string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Create the apps_fts virtual table + sync triggers, and backfill once if empty. Idempotent.
 *  No-ops on Postgres (FTS5 is SQLite-only; pg search falls back to LIKE — see #244). */
export async function ensureAppsFts(db: Db): Promise<void> {
  if (isPostgres(db)) return; // FTS5 has no pg equivalent — nothing to create.

  await dbRun(
    db,
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS apps_fts USING fts5(app_id UNINDEXED, title, developer, tokenize='unicode61')`,
  );
  await dbRun(
    db,
    sql`CREATE TRIGGER IF NOT EXISTS apps_fts_ai AFTER INSERT ON apps BEGIN
    INSERT INTO apps_fts(app_id, title, developer) VALUES (new.id, new.title, new.developer);
  END`,
  );
  await dbRun(
    db,
    sql`CREATE TRIGGER IF NOT EXISTS apps_fts_au AFTER UPDATE OF title, developer ON apps BEGIN
    UPDATE apps_fts SET title = new.title, developer = new.developer WHERE app_id = new.id;
  END`,
  );
  await dbRun(
    db,
    sql`CREATE TRIGGER IF NOT EXISTS apps_fts_ad AFTER DELETE ON apps BEGIN
    DELETE FROM apps_fts WHERE app_id = old.id;
  END`,
  );
  // Cheap unlocked read first — the common already-populated boot does NO write, so it
  // never takes a write lock that would contend with the ingest fleet. Number() guards
  // against a bigint count (libsql intMode) making `=== 0` silently false on an empty table.
  const existing = await dbGet<{ c: number }>(db, sql`SELECT count(*) AS c FROM apps_fts`);
  if (Number(existing?.c ?? 0) > 0) return;

  // Empty → backfill once, atomically. The re-check inside an IMMEDIATE transaction
  // serialises concurrent first-boots; and even if the driver downgrades it to deferred,
  // the loser's INSERT hits SQLITE_BUSY and aborts rather than double-inserting every app
  // (FTS5 has no unique key, so a double-insert would return every result twice).
  await db.transaction(
    async (tx) => {
      const row = await dbGet<{ c: number }>(tx as unknown as Db, sql`SELECT count(*) AS c FROM apps_fts`);
      if (Number(row?.c ?? 0) === 0) {
        await dbRun(
          tx as unknown as Db,
          sql`INSERT INTO apps_fts(app_id, title, developer) SELECT id, title, developer FROM apps`,
        );
      }
    },
    { behavior: "immediate" },
  );
}

/** App ids whose title/developer match the text, most-relevant first, capped.
 *  Postgres falls back to a `LIKE` scan (no FTS5 rank); SQLite uses FTS5 MATCH. */
export async function searchAppIds(db: Db, query: string, limit: number): Promise<string[]> {
  if (isPostgres(db)) {
    const tokens = ftsTokens(query);
    if (!tokens.length) return [];
    const cond = sql.join(
      tokens.map((t) => sql`(lower(title) LIKE ${`%${t}%`} OR lower(developer) LIKE ${`%${t}%`})`),
      sql` AND `,
    );
    const rows = await dbAll<{ app_id: string }>(
      db,
      sql`SELECT id AS app_id FROM apps WHERE ${cond} ORDER BY id LIMIT ${limit}`,
    );
    return rows.map((r) => r.app_id);
  }

  const match = toFtsMatch(query);
  if (!match) return [];
  const rows = await dbAll<{ app_id: string }>(
    db,
    sql`SELECT app_id FROM apps_fts WHERE apps_fts MATCH ${match} ORDER BY rank LIMIT ${limit}`,
  );
  return rows.map((r) => r.app_id);
}

/** Total apps matching the text — the "X of Y" count for a search.
 *  Postgres falls back to a `LIKE` count; SQLite uses FTS5 MATCH. */
export async function countAppIdsByText(db: Db, query: string): Promise<number> {
  if (isPostgres(db)) {
    const tokens = ftsTokens(query);
    if (!tokens.length) return 0;
    const cond = sql.join(
      tokens.map((t) => sql`(lower(title) LIKE ${`%${t}%`} OR lower(developer) LIKE ${`%${t}%`})`),
      sql` AND `,
    );
    const row = await dbGet<{ c: number }>(db, sql`SELECT count(*) AS c FROM apps WHERE ${cond}`);
    return Number(row?.c ?? 0);
  }

  const match = toFtsMatch(query);
  if (!match) return 0;
  const row = await dbGet<{ c: number }>(
    db,
    sql`SELECT count(*) AS c FROM apps_fts WHERE apps_fts MATCH ${match}`,
  );
  return Number(row?.c ?? 0);
}

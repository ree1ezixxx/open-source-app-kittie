import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../client.js";
import { dbAll, dbGet, dbRun, isPostgres } from "../dialect.js";
import { foldSearchText, pgSearchVectorExpr } from "../fts-normalize.js";

/**
 * Full-text search over app title + developer. Replaces the leading-wildcard
 * `LIKE '%q%'` scan that full-scanned ~1.1M rows on every keystroke (~20s).
 *
 * Token-prefix semantics: "duo" matches "Duolingo", "candy cru" matches "Candy Crush".
 * Description is intentionally not indexed — search is by app name / developer (matching
 * the source-of-truth), and indexing 1.1M descriptions would multiply the DB size.
 *
 * DIALECT (#244, follow-up to #245): each dialect gets its native engine.
 *   - SQLite: FTS5 virtual table `apps_fts` + sync triggers + `MATCH` (unchanged).
 *   - Postgres: a generated STORED `tsvector` column `apps.search_tsv` + GIN index
 *     (self-syncing — no triggers), queried with `@@ to_tsquery('simple', …)` and
 *     ranked by `ts_rank`. Parity with FTS5's unicode61 tokenizer needs more than
 *     the 'simple' config (no stemming/stopwords): unicode61 also FOLDS DIACRITICS
 *     ("Pokémon" → pokemon) and splits on ALL non-alphanumerics ("Node.js" → node,
 *     js — pg's parser would keep it as one host-lexeme). So one shared fold map
 *     (fts-normalize.ts) is applied to BOTH the document expression and the query
 *     tokens; the parity tests drive both engines and assert identical results.
 */

/** Build an FTS5 MATCH expression: each token becomes a prefix term, AND-combined.
 *  "Candy Cru" → `candy* cru*`. Returns null when the query has no usable token. */
export function toFtsMatch(query: string): string | null {
  const tokens = ftsTokens(query);
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}*`).join(" ");
}

/** Build a Postgres tsquery string with the SAME semantics as FTS5's MATCH on
 *  unicode61: the query text is diacritic-folded (like the `search_tsv` document —
 *  "Pokémon" → pokemon), then each token becomes a `:*` prefix term, `&`-combined.
 *  "Candy Cru" → `candy:* & cru:*`. Tokens are alnum runs from our own tokenizer
 *  (never raw user text), so the string is always valid `to_tsquery` input.
 *  Returns null when the query has no usable token. */
export function toPgTsQuery(query: string): string | null {
  const tokens = ftsTokens(foldSearchText(query));
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/** Shared tokenizer for both dialects: lowercased alnum runs. */
function ftsTokens(query: string): string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Dialect-specific SQL fragments for an app full-text match, for callers that
 * compose the match with their own joins/filters (the API's search candidate
 * queries). The SQLite fragments reproduce the FTS5 query shape byte-for-byte;
 * the pg fragments use the `search_tsv` tsvector column instead.
 *
 * Usage: `SELECT … FROM ${from} JOIN app_snapshots … WHERE ${match} AND …
 *         [ORDER BY ${rank}, apps.id]`.
 */
export interface AppsFtsQuery {
  /** FROM clause providing `apps` (sqlite: apps_fts JOIN apps; pg: just apps). */
  from: SQL;
  /** WHERE predicate matching `apps` rows against the search text. */
  match: SQL;
  /** ORDER BY fragment, most-relevant first (direction included). */
  rank: SQL;
}

/** Build the dialect-appropriate FTS fragments for a search string, or null when
 *  the query has no usable token (callers keep their non-search path). */
export function appsFtsQuery(db: Db, query: string): AppsFtsQuery | null {
  if (isPostgres(db)) {
    const tsq = toPgTsQuery(query);
    if (!tsq) return null;
    return {
      from: sql`apps`,
      match: sql`apps.search_tsv @@ to_tsquery('simple', ${tsq})`,
      rank: sql`ts_rank(apps.search_tsv, to_tsquery('simple', ${tsq})) DESC`,
    };
  }
  const match = toFtsMatch(query);
  if (!match) return null;
  return {
    from: sql`apps_fts
    JOIN apps ON apps.id = apps_fts.app_id`,
    match: sql`apps_fts MATCH ${match}`,
    rank: sql`apps_fts.rank`,
  };
}

/** Create the dialect's full-text structures. Idempotent.
 *  - SQLite: `apps_fts` FTS5 virtual table + sync triggers, backfilled once if empty.
 *  - Postgres: the generated `search_tsv` column + GIN index (normally created by the
 *    0001 pg migration; this covers databases migrated before it existed). Generated
 *    STORED needs no backfill or triggers — Postgres computes it on write. */
export async function ensureAppsFts(db: Db): Promise<void> {
  if (isPostgres(db)) {
    // Same document expression as the schema.pg.ts generated column (single
    // source of truth in fts-normalize.ts) — a db that got the column from the
    // migration and one that got it from here index text identically.
    await dbRun(
      db,
      sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (${sql.raw(pgSearchVectorExpr(`coalesce("title", '') || ' ' || coalesce("developer", '')`))}) STORED`,
    );
    await dbRun(db, sql`CREATE INDEX IF NOT EXISTS apps_search_tsv_idx ON apps USING gin (search_tsv)`);
    return;
  }

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
 *  SQLite: FTS5 MATCH ordered by bm25 rank. Postgres: tsvector `@@` ordered by ts_rank. */
export async function searchAppIds(db: Db, query: string, limit: number): Promise<string[]> {
  if (isPostgres(db)) {
    const tsq = toPgTsQuery(query);
    if (!tsq) return [];
    const rows = await dbAll<{ app_id: string }>(
      db,
      sql`SELECT id AS app_id FROM apps
      WHERE search_tsv @@ to_tsquery('simple', ${tsq})
      ORDER BY ts_rank(search_tsv, to_tsquery('simple', ${tsq})) DESC, id
      LIMIT ${limit}`,
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
 *  SQLite: FTS5 MATCH count. Postgres: tsvector `@@` count. */
export async function countAppIdsByText(db: Db, query: string): Promise<number> {
  if (isPostgres(db)) {
    const tsq = toPgTsQuery(query);
    if (!tsq) return 0;
    const row = await dbGet<{ c: number }>(
      db,
      sql`SELECT count(*) AS c FROM apps WHERE search_tsv @@ to_tsquery('simple', ${tsq})`,
    );
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

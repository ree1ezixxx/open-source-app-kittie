/**
 * Dialect-neutral query seam (#245).
 *
 * The canonical {@link Db} handle is typed as the libsql/SQLite drizzle instance,
 * but at runtime it can also be a Postgres (pg / pglite) drizzle instance — the
 * dual-dialect port (#242) casts the pg driver to `Db` at the boundary.
 *
 * The two drivers disagree on the raw-SQL escape hatch:
 *   - SQLite (libsql) sessions expose `.all()` / `.get()` / `.run()`.
 *   - Postgres (`PgDatabase`) exposes only `.execute()`, which resolves to
 *     `{ rows, fields, affectedRows }` rather than a bare array.
 *
 * Calling `.all()` on a pg handle is a `TypeError`. These helpers route through
 * whichever escape hatch the live handle actually has, so the ~20 query modules
 * can run raw SQL on both dialects. Builder-style queries (`db.select()…`) are
 * already dialect-portable via drizzle and need no seam.
 */
import type { SQL } from "drizzle-orm";

export type Dialect = "sqlite" | "postgres";

/** Minimal structural view of either drizzle handle — enough to detect + route. */
interface AnyDriver {
  all?: (query: SQL) => Promise<unknown[]>;
  get?: (query: SQL) => Promise<unknown>;
  run?: (query: SQL) => Promise<unknown>;
  execute?: (query: SQL) => Promise<unknown>;
}

/**
 * Which dialect a live handle speaks. Feature-detected (not tagged) so it also
 * works for handles built outside `createDb` — e.g. the pglite drizzle instance
 * the tests construct directly. SQLite sessions have `.all`; pg handles do not.
 */
export function dialectOf(db: unknown): Dialect {
  return typeof (db as AnyDriver).all === "function" ? "sqlite" : "postgres";
}

/** True when the live handle is Postgres — the FTS5 / SQLite-only branch guard. */
export function isPostgres(db: unknown): boolean {
  return dialectOf(db) === "postgres";
}

/** pg `.execute()` resolves to `{ rows, affectedRows }`; normalise both. */
interface PgExecuteResult {
  rows?: unknown[];
  affectedRows?: number;
}

/** Run a raw SELECT and return every row, on either dialect. */
export async function dbAll<T>(db: unknown, query: SQL): Promise<T[]> {
  const driver = db as AnyDriver;
  if (typeof driver.all === "function") {
    return (await driver.all(query)) as T[];
  }
  const res = (await driver.execute!(query)) as PgExecuteResult;
  return (res.rows ?? []) as T[];
}

/** Run a raw SELECT and return the first row (or undefined), on either dialect. */
export async function dbGet<T>(db: unknown, query: SQL): Promise<T | undefined> {
  const driver = db as AnyDriver;
  if (typeof driver.get === "function") {
    return (await driver.get(query)) as T | undefined;
  }
  const res = (await driver.execute!(query)) as PgExecuteResult;
  return (res.rows?.[0] as T | undefined) ?? undefined;
}

/** Run a raw write and return `{ rowsAffected }`, on either dialect. */
export async function dbRun(db: unknown, query: SQL): Promise<{ rowsAffected: number }> {
  const driver = db as AnyDriver;
  if (typeof driver.run === "function") {
    const res = (await driver.run(query)) as { rowsAffected?: number };
    return { rowsAffected: res.rowsAffected ?? 0 };
  }
  const res = (await driver.execute!(query)) as PgExecuteResult;
  return { rowsAffected: res.affectedRows ?? 0 };
}

/**
 * Coerce a stored timestamp column back to a JS Date, on either dialect.
 *
 * SQLite stores `integer({ mode: "timestamp" })` as an epoch-**seconds** int, so
 * a raw read yields a number that must be `*1000`'d. Postgres `timestamptz` comes
 * back from `.execute()` as an ISO-ish **string** (e.g. `2026-07-02 19:17:57+00`),
 * which `new Date(str)` parses directly. A Date passed through (drizzle-mapped
 * reads) is returned as-is. Null/invalid → null.
 */
export function coerceTimestamp(value: number | string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

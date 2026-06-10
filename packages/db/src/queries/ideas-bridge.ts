import { sql } from "drizzle-orm";

import type { Db } from "../client.js";

/* ============================================================
   Additive lane — read-only bridge into the parity lane's
   app_ideas table (Hot Ideas pipeline). That table lives in the
   shared SQLite file but NOT in this branch's drizzle schema, so
   it is read with raw SQL, defensively: when the table is absent
   (pipeline not yet run), callers get { available: false } —
   never a crash, never fabricated ideas.
   ============================================================ */

export interface IdeaRow {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  sourceCategory: string | null;
  ideaCategory: string | null;
  /** Every remaining column, verbatim — blueprint JSON lives here under
      whatever names the parity pipeline chose. */
  extra: Record<string, unknown>;
}

export async function ideasTableExists(db: Db): Promise<boolean> {
  const rows = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name='app_ideas'`,
  );
  return rows.length > 0;
}

const KNOWN = new Set(["id", "slug", "title", "summary", "source_category", "idea_category"]);

function mapRow(raw: Record<string, unknown>): IdeaRow {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN.has(k)) extra[k] = v;
  }
  return {
    id: String(raw.id),
    slug: raw.slug == null ? null : String(raw.slug),
    title: String(raw.title ?? "Untitled idea"),
    summary: raw.summary == null ? null : String(raw.summary),
    sourceCategory: raw.source_category == null ? null : String(raw.source_category),
    ideaCategory: raw.idea_category == null ? null : String(raw.idea_category),
    extra,
  };
}

export async function listIdeaRows(
  db: Db,
  opts: { search?: string; limit?: number } = {},
): Promise<IdeaRow[]> {
  if (!(await ideasTableExists(db))) return [];
  const limit = Math.min(opts.limit ?? 50, 200);
  const term = opts.search?.trim();
  const rows = term
    ? db.all<Record<string, unknown>>(
        sql`SELECT * FROM app_ideas WHERE title LIKE ${"%" + term + "%"} OR summary LIKE ${"%" + term + "%"} LIMIT ${limit}`,
      )
    : db.all<Record<string, unknown>>(sql`SELECT * FROM app_ideas LIMIT ${limit}`);
  return rows.map(mapRow);
}

export async function getIdeaRow(db: Db, id: string): Promise<IdeaRow | null> {
  if (!(await ideasTableExists(db))) return null;
  const rows = db.all<Record<string, unknown>>(sql`SELECT * FROM app_ideas WHERE id = ${id} LIMIT 1`);
  const row = rows[0];
  return row ? mapRow(row) : null;
}

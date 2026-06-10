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

/* ============================================================
   Write path — the autonomous idea generator (additive lane)
   clones the parity Hot Ideas logic and keeps app_ideas live as
   markets shift. Raw SQL because the table is parity-owned (not in
   this branch's drizzle schema); INSERT OR REPLACE resolves the
   source_app_id unique conflict so re-running refreshes an app's
   idea in place rather than duplicating it.
   ============================================================ */

export interface IdeaInsert {
  id: string;
  sourceAppId: string;
  slug: string;
  title: string;
  summary: string;
  sourceCategory: string;
  ideaCategory: string;
  needsBackend: boolean;
  needsDatabase: boolean;
  needsAi: boolean;
  /** Stringified blueprint JSON (requirements, mvpFeatures, techStack, …). */
  blueprint: string;
  reviewCount: number;
  rating: number | null;
  downloadsEstimate: number | null;
  revenueEstimate: number | null;
  price: number | null;
  /** Epoch seconds. */
  releasedAt: number | null;
  /** Epoch seconds. */
  createdAt: number;
}

export async function insertOrReplaceIdea(db: Db, idea: IdeaInsert): Promise<void> {
  if (!(await ideasTableExists(db))) return;
  db.run(sql`
    INSERT OR REPLACE INTO app_ideas (
      id, source_app_id, slug, title, summary, source_category, idea_category,
      needs_backend, needs_database, needs_ai, blueprint,
      review_count, rating, downloads_estimate, revenue_estimate, price,
      released_at, created_at
    ) VALUES (
      ${idea.id}, ${idea.sourceAppId}, ${idea.slug}, ${idea.title}, ${idea.summary},
      ${idea.sourceCategory}, ${idea.ideaCategory},
      ${idea.needsBackend ? 1 : 0}, ${idea.needsDatabase ? 1 : 0}, ${idea.needsAi ? 1 : 0},
      ${idea.blueprint},
      ${idea.reviewCount}, ${idea.rating}, ${idea.downloadsEstimate}, ${idea.revenueEstimate},
      ${idea.price}, ${idea.releasedAt}, ${idea.createdAt}
    )
  `);
}

/** source_app_id → created_at (epoch seconds) for every stored idea — the
    generator's "already covered" set, so it refreshes stale ideas rather
    than re-spending an LLM call on an app it just ideated. */
export async function ideatedSourceApps(db: Db): Promise<Map<string, number>> {
  if (!(await ideasTableExists(db))) return new Map();
  const rows = db.all<{ source_app_id: string; created_at: number }>(
    sql`SELECT source_app_id, created_at FROM app_ideas`,
  );
  return new Map(rows.map((r) => [String(r.source_app_id), Number(r.created_at)]));
}

/** Feed-level freshness for the Hot Ideas stamp: how many ideas exist and
    when the newest was generated (epoch seconds, or null when empty). */
export async function ideaFeedStats(
  db: Db,
): Promise<{ count: number; latestCreatedAt: number | null }> {
  if (!(await ideasTableExists(db))) return { count: 0, latestCreatedAt: null };
  const rows = db.all<{ n: number; latest: number | null }>(
    sql`SELECT COUNT(*) AS n, MAX(created_at) AS latest FROM app_ideas`,
  );
  const row = rows[0];
  return {
    count: Number(row?.n ?? 0),
    latestCreatedAt: row?.latest != null ? Number(row.latest) : null,
  };
}

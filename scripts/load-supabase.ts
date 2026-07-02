/**
 * Initial bounded data load: local SQLite (data/kittie.db) -> Supabase Postgres.
 *
 * Loads a WORKING SET, not the full catalog (Supabase free tier = 500MB):
 *   1. Applies the drizzle pg migration DDL (packages/db/drizzle/pg) — idempotent.
 *   2. apps: top-N by latest-snapshot review_count (default 100k), plus any app
 *      referenced by the small lookup tables (FK integrity).
 *   3. app_snapshots: ONLY each loaded app's latest snapshot date (all markets).
 *   4. Small lookup tables: keywords, chart_rankings, reviews, app_ideas,
 *      cloneable_apps, tracked_keywords, sweep_state, ai_generations.
 *
 * Resumable: every insert is ON CONFLICT DO NOTHING; re-running skips loaded rows.
 * Budget-guarded: checks pg_database_size between phases and aborts past MAX_DB_MB.
 *
 * Secrets: reads SUPABASE_DATABASE_URL from the environment (falls back to the
 * repo-root .env). Never logs the URL.
 *
 * Usage:
 *   pnpm exec tsx scripts/load-supabase.ts [--apps=100000] [--batch=2000] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const SQLITE_PATH = process.env.KITTIE_SQLITE_PATH ?? path.join(repoRoot, "data", "kittie.db");
const PG_MIGRATIONS_DIR = path.join(repoRoot, "packages", "db", "drizzle", "pg");

const MAX_DB_MB = Number(process.env.MAX_DB_MB ?? 350);
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);
const TOP_N = Number(args.apps ?? 100_000);
const BATCH = Number(args.batch ?? 2_000);
const DRY_RUN = args["dry-run"] === "true";

function loadDatabaseUrl(): string {
  if (process.env.SUPABASE_DATABASE_URL) return process.env.SUPABASE_DATABASE_URL;
  const envPath = path.join(repoRoot, ".env");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/^SUPABASE_DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  }
  throw new Error("SUPABASE_DATABASE_URL not set (env or repo .env)");
}

const sql = postgres(loadDatabaseUrl(), {
  max: 4,
  connect_timeout: 30,
  idle_timeout: 30,
  prepare: false,
});
const lite = new Database(SQLITE_PATH, { readonly: true });

// ---------- helpers ----------

const tsSec = (v: unknown): Date | null =>
  v === null || v === undefined ? null : new Date(Number(v) * 1000);
const bool = (v: unknown): boolean | null =>
  v === null || v === undefined ? null : Number(v) !== 0;
/** pg int4 guard: SQLite INTEGER is 64-bit, pg schema uses `integer` (int4).
 *  Out-of-range values (seen: file_size_bytes ~2.6GB) become NULL — honest-data
 *  rule: null beats a clamped fabrication. Schema fix (bigint) is a follow-up. */
const I4_MAX = 2_147_483_647;
const i4 = (v: unknown): number | null =>
  v === null || v === undefined || Math.abs(Number(v)) > I4_MAX ? null : Number(v);

async function dbSizeMb(): Promise<number> {
  const [{ sz }] = await sql`select pg_database_size(current_database())::bigint as sz`;
  return Number(sz) / 1024 / 1024;
}

async function guardBudget(phase: string): Promise<void> {
  const mb = await dbSizeMb();
  console.log(`[size] after ${phase}: ${mb.toFixed(1)} MB`);
  if (mb > MAX_DB_MB) {
    throw new Error(`DB size ${mb.toFixed(1)} MB exceeds budget ${MAX_DB_MB} MB — stopping`);
  }
}

async function applyMigrations(): Promise<void> {
  const files = fs.readdirSync(PG_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const ddl = fs.readFileSync(path.join(PG_MIGRATIONS_DIR, f), "utf8");
    const statements = ddl.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    let applied = 0;
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        applied++;
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        if (/already exists/i.test(msg)) {
          skipped++;
          continue;
        }
        throw e;
      }
    }
    console.log(`[ddl] ${f}: ${applied} applied, ${skipped} already existed`);
  }
}

/** Multi-row insert with ON CONFLICT DO NOTHING, in batches, inside transactions. */
async function insertBatched(
  table: string,
  rows: Record<string, unknown>[],
  columns: string[],
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (DRY_RUN) continue;
    await sql.begin(async (tx) => {
      const res = await tx`
        insert into ${tx(table)} ${tx(chunk, ...(columns as []))}
        on conflict do nothing
      `;
      inserted += res.count;
    });
    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`\r[${table}] ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
  }
  process.stdout.write(`\r[${table}] ${rows.length}/${rows.length} scanned, ${inserted} inserted\n`);
  return inserted;
}

// ---------- app selection ----------

type SqliteRow = Record<string, unknown>;

function selectTopAppIds(): Set<string> {
  console.log(`[select] top ${TOP_N} apps by latest-snapshot review_count…`);
  const rows = lite
    .prepare(
      // INDEXED BY: without it SQLite picks snapshots_date_reviews_app_idx
      // (snapshot_date=?) and scans every row of each date per app — pathological.
      `SELECT a.id
       FROM apps a
       JOIN app_snapshots s INDEXED BY snapshots_app_date_country_idx
         ON s.app_id = a.id AND s.snapshot_date = a.last_snapshot_date
       WHERE a.last_snapshot_date IS NOT NULL
       GROUP BY a.id
       ORDER BY MAX(s.review_count) DESC
       LIMIT ?`,
    )
    .all(TOP_N) as { id: string }[];
  const ids = new Set(rows.map((r) => r.id));

  // FK closure: lookup tables reference apps outside the top-N — include them.
  const refQueries = [
    "SELECT DISTINCT app_id AS id FROM chart_rankings",
    "SELECT DISTINCT app_id AS id FROM reviews",
    "SELECT DISTINCT source_app_id AS id FROM app_ideas",
    "SELECT DISTINCT app_id AS id FROM cloneable_apps WHERE app_id IS NOT NULL",
    "SELECT DISTINCT app_id AS id FROM tracked_apps",
  ];
  let extra = 0;
  for (const q of refQueries) {
    for (const r of lite.prepare(q).all() as { id: string }[]) {
      if (!ids.has(r.id)) {
        ids.add(r.id);
        extra++;
      }
    }
  }
  console.log(`[select] ${ids.size} apps (${extra} added for FK closure)`);
  return ids;
}

// ---------- row mappers (sqlite epoch-seconds -> Date, 0/1 -> boolean) ----------

const mapApp = (r: SqliteRow) => ({
  id: r.id,
  store: r.store,
  store_app_id: r.store_app_id,
  bundle_id: r.bundle_id,
  title: r.title,
  developer: r.developer,
  category: r.category,
  icon_url: r.icon_url,
  description: r.description,
  website_url: r.website_url,
  support_email: r.support_email,
  price: r.price,
  content_rating: r.content_rating,
  languages: r.languages,
  screenshot_urls: r.screenshot_urls,
  released_at: tsSec(r.released_at),
  updated_at: tsSec(r.updated_at),
  first_seen_at: tsSec(r.first_seen_at),
  last_ingested_at: tsSec(r.last_ingested_at),
  last_snapshot_date: r.last_snapshot_date,
  last_attempted_at: tsSec(r.last_attempted_at),
  file_size_bytes: i4(r.file_size_bytes),
  min_os_version: r.min_os_version,
  seller_name: r.seller_name,
});

const mapSnapshot = (r: SqliteRow) => ({
  id: r.id,
  app_id: r.app_id,
  snapshot_date: r.snapshot_date,
  review_count: r.review_count ?? 0,
  rating: r.rating,
  chart_rank: r.chart_rank,
  chart_category: r.chart_category,
  chart_country: r.chart_country,
  downloads_estimate: i4(r.downloads_estimate),
  revenue_estimate: i4(r.revenue_estimate),
  growth_score: r.growth_score,
  is_first_mover: bool(r.is_first_mover) ?? false,
  created_at: tsSec(r.created_at),
});

/** Lookup tables: column name -> transform. Anything not listed passes through. */
const LOOKUPS: {
  table: string;
  tsCols: string[];
  boolCols?: string[];
}[] = [
  { table: "keywords", tsCols: ["computed_at"] },
  { table: "chart_rankings", tsCols: ["created_at"] },
  { table: "reviews", tsCols: ["reviewed_at", "ingested_at"] },
  {
    table: "app_ideas",
    tsCols: ["released_at", "created_at"],
    boolCols: ["needs_backend", "needs_database", "needs_ai"],
  },
  { table: "cloneable_apps", tsCols: ["synced_at", "created_at"] },
  { table: "tracked_keywords", tsCols: ["tracked_at"] },
  { table: "sweep_state", tsCols: ["last_run_at"] },
  { table: "ai_generations", tsCols: ["created_at"] },
];

// ---------- phases ----------

async function loadApps(ids: Set<string>): Promise<number> {
  const idList = [...ids];
  let total = 0;
  const stmt = lite.prepare(
    `SELECT * FROM apps WHERE id IN (${Array.from({ length: 500 }, () => "?").join(",")})`,
  );
  const cols = Object.keys(mapApp({}));
  const buffer: Record<string, unknown>[] = [];
  for (let i = 0; i < idList.length; i += 500) {
    const chunk = idList.slice(i, i + 500);
    const padded = [...chunk, ...Array(500 - chunk.length).fill(" none")];
    buffer.push(...(stmt.all(...padded) as SqliteRow[]).map(mapApp));
    if (buffer.length >= BATCH * 5 || i + 500 >= idList.length) {
      total += await insertBatched("apps", buffer.splice(0), cols);
    }
  }
  return total;
}

async function loadLatestSnapshots(ids: Set<string>): Promise<number> {
  const idList = [...ids];
  let total = 0;
  const stmt = lite.prepare(
    `SELECT s.* FROM app_snapshots s INDEXED BY snapshots_app_date_country_idx
     JOIN apps a ON a.id = s.app_id AND s.snapshot_date = a.last_snapshot_date
     WHERE s.app_id IN (${Array.from({ length: 500 }, () => "?").join(",")})`,
  );
  const cols = Object.keys(mapSnapshot({}));
  const buffer: Record<string, unknown>[] = [];
  for (let i = 0; i < idList.length; i += 500) {
    const chunk = idList.slice(i, i + 500);
    const padded = [...chunk, ...Array(500 - chunk.length).fill(" none")];
    buffer.push(...(stmt.all(...padded) as SqliteRow[]).map(mapSnapshot));
    if (buffer.length >= BATCH * 5 || i + 500 >= idList.length) {
      total += await insertBatched("app_snapshots", buffer.splice(0), cols);
    }
  }
  return total;
}

async function loadLookups(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { table, tsCols, boolCols = [] } of LOOKUPS) {
    const rows = lite.prepare(`SELECT * FROM ${table}`).all() as SqliteRow[];
    if (rows.length === 0) {
      counts[table] = 0;
      continue;
    }
    const mapped = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const c of tsCols) out[c] = tsSec(r[c]);
      for (const c of boolCols) out[c] = bool(r[c]) ?? false;
      return out;
    });
    counts[table] = await insertBatched(table, mapped, Object.keys(mapped[0]));
  }
  return counts;
}

async function verify(): Promise<void> {
  const tables = ["apps", "app_snapshots", ...LOOKUPS.map((l) => l.table)];
  for (const t of tables) {
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`;
    console.log(`[verify] ${t}: ${n} rows`);
  }
  const known = ["apple:544007664", "apple:6446901002", "apple:389801252"];
  for (const id of known) {
    const [app] = await sql`select id, title, developer, last_snapshot_date from apps where id = ${id}`;
    const [snap] =
      await sql`select review_count, rating, snapshot_date from app_snapshots where app_id = ${id} order by snapshot_date desc limit 1`;
    console.log(`[spot] ${id}: ${app?.title ?? "MISSING"} | snap=${JSON.stringify(snap ?? null)}`);
  }
  const t0 = performance.now();
  await sql`select id, title from apps where store = 'apple' and store_app_id = '544007664'`;
  console.log(`[timing] indexed lookup (apps_store_app_id_idx): ${(performance.now() - t0).toFixed(1)} ms`);
}

// ---------- main ----------

async function main(): Promise<void> {
  console.log(`[cfg] topN=${TOP_N} batch=${BATCH} budget=${MAX_DB_MB}MB dryRun=${DRY_RUN}`);
  await guardBudget("connect");
  if (!DRY_RUN) await applyMigrations();

  const ids = selectTopAppIds();

  const apps = await loadApps(ids);
  await guardBudget("apps");

  const snaps = await loadLatestSnapshots(ids);
  await guardBudget("app_snapshots");

  const lookups = await loadLookups();
  await guardBudget("lookups");

  console.log(`[done] apps=+${apps} snapshots=+${snaps} lookups=${JSON.stringify(lookups)}`);
  await verify();
  await sql.end();
  lite.close();
}

main().catch(async (e) => {
  console.error("[fatal]", e instanceof Error ? e.message : e);
  await sql.end().catch(() => {});
  process.exit(1);
});

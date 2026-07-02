#!/usr/bin/env node
/**
 * Daily snapshot carry-forward (fixes Explore blanking under the due-driven worker).
 *
 * Explore/Highlights/Rising sort the whole catalog fast by pinning to ONE day —
 * `max(snapshot_date)` — served by the (snapshot_date, review_count) index. The
 * incremental worker (ADR 0008) only writes the few-thousand apps it refreshes
 * each day, so that newest day is sparse and the global-max pin blanks Explore to
 * those few-k apps. (The old bulk avoided this by writing all 1.1M every day.)
 *
 * Once per UTC day this copies each app's most recent metric row forward to today
 * — a single in-DB `INSERT … SELECT` (no network) — so the latest day is FULL and
 * the read stays unchanged/fast. `INSERT OR IGNORE` keeps any today row the worker
 * already wrote (fresh data wins); the metric pass then UPDATEs the genuinely-
 * refreshed apps, while the long tail carries yesterday's (in-window) numbers
 * until its turn. Chart columns are deliberately NOT carried — the chart capture
 * owns chart_rank.
 */
import { loadEnv } from "@kittie/core";
import { createDb, dbAll, dbRun, isPostgres, type Db } from "@kittie/db";
import { sql } from "drizzle-orm";

import { todaySnapshotDate } from "../util/dates.js";

export interface CarryForwardResult {
  snapshotDate: string;
  countries: string[];
  carried: number;
  ms: number;
}

export async function carryForwardSnapshots(
  db: Db,
  opts: { snapshotDate?: string; countries?: string[] } = {},
): Promise<CarryForwardResult> {
  const snapshotDate = opts.snapshotDate ?? todaySnapshotDate();
  const countries = (opts.countries ?? ["US"]).map((c) => c.toUpperCase());
  const pg = isPostgres(db);
  // created_at: SQLite `integer({mode:"timestamp"})` stores epoch **seconds**; Postgres
  // `timestamptz` wants an ISO timestamp. Writing a bare epoch int into timestamptz on pg
  // would be read back as a 1970-era Date, so branch the literal by dialect (#245).
  const now = new Date();
  const createdAtExpr = pg ? sql`${now.toISOString()}::timestamptz` : sql`${Math.floor(now.getTime() / 1000)}`;
  // INSERT OR IGNORE is SQLite-only; pg uses ON CONFLICT DO NOTHING against the unique key.
  const insertPrefix = pg ? sql`INSERT INTO app_snapshots` : sql`INSERT OR IGNORE INTO app_snapshots`;
  const conflictClause = pg ? sql` ON CONFLICT DO NOTHING` : sql``;
  const started = Date.now();
  const did: string[] = [];
  let carried = 0;

  for (const cc of countries) {
    // Source = the latest day strictly before today for this market (last full day).
    const rows = await dbAll<{ d: string | null }>(
      db,
      sql`SELECT max(snapshot_date) AS d FROM app_snapshots WHERE snapshot_date < ${snapshotDate} AND chart_country = ${cc}`,
    );
    const prevMax = rows[0]?.d;
    if (!prevMax) continue; // no prior day to carry (first run for this market)

    // id: US keeps the bare `appId:date`; other markets suffix the country —
    // mirrors makeSnapshotId so the unique (app, date, country) key holds.
    const idExpr =
      cc === "US"
        ? sql`app_id || ':' || ${snapshotDate}`
        : sql`app_id || ':' || ${snapshotDate} || ':' || ${cc}`;

    const res = await dbRun(
      db,
      sql`
      ${insertPrefix}
        (id, app_id, snapshot_date, review_count, rating, chart_country,
         downloads_estimate, revenue_estimate, growth_score, is_first_mover, created_at)
      SELECT ${idExpr}, app_id, ${snapshotDate}, review_count, rating, chart_country,
             downloads_estimate, revenue_estimate, growth_score, is_first_mover, ${createdAtExpr}
      FROM app_snapshots
      WHERE snapshot_date = ${prevMax} AND chart_country = ${cc}${conflictClause}
    `,
    );
    carried += res.rowsAffected;
    did.push(cc);
  }

  return { snapshotDate, countries: did, carried, ms: Date.now() - started };
}

const isMain = process.argv[1]?.includes("carry-forward");
if (isMain) {
  loadEnv();
  const countries = (process.env.CHART_COUNTRIES ?? "US").split(",").map((s) => s.trim()).filter(Boolean);
  carryForwardSnapshots(createDb(), { countries })
    .then((r) => {
      console.log(`[carry-forward] ${JSON.stringify(r)}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[carry-forward] fatal:", e);
      process.exit(1);
    });
}

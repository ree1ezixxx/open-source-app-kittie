/**
 * PROTOTYPE backfill (perf/response-time): persist revenue/downloads/growth estimates
 * onto every app_snapshots row of the latest complete day, so `sortBy=revenue` can be
 * served from a SQL column + index instead of scoring the whole candidate pool live.
 *
 * Reuses the API's exact buildScoredAppRows, so the persisted value == what the live
 * path would compute (the API already prefers the column when non-null). Period = 7d
 * (the default Explore view).
 *
 *   DATABASE_URL=… tsx packages/api/src/scripts/backfill-estimates.ts [YYYY-MM-DD]
 */
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db.js";
import { buildScoredAppRows } from "../services/app-list-scoring.js";

const BATCH = 2000;

async function main() {
  const db = getDb();
  const day =
    process.argv[2] ??
    (await db.get<{ d: string }>(sql`SELECT max(snapshot_date) d FROM app_snapshots WHERE review_count > 0`))?.d;
  if (!day) throw new Error("no snapshot day found");

  const idRows = await db.all<{ id: string }>(
    sql`SELECT app_id AS id FROM app_snapshots WHERE snapshot_date = ${day} AND chart_country = 'US'`,
  );
  const ids = idRows.map((r) => r.id);
  console.log(`[backfill] day=${day} rows=${ids.length}`);

  let done = 0;
  let updated = 0;
  const t0 = Date.now();
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const rows = await buildScoredAppRows(batch, "7d", "US", new Map());

    await db.transaction(
      async (tx) => {
        for (const r of rows) {
          const rev = r.item.revenueEstimate30d;
          const dl = r.item.downloadsEstimate30d;
          const gr = r.item.growthScore;
          if (rev == null && dl == null && gr == null) continue;
          await tx.run(
            sql`UPDATE app_snapshots SET revenue_estimate = ${rev ?? null}, downloads_estimate = ${dl ?? null}, growth_score = ${gr ?? null}
                WHERE app_id = ${r.item.id} AND snapshot_date = ${day} AND chart_country = 'US'`,
          );
          updated++;
        }
      },
      { behavior: "immediate" },
    );

    done += batch.length;
    if (done % 20000 < BATCH || done >= ids.length) {
      const rate = Math.round(done / ((Date.now() - t0) / 1000));
      console.log(`[backfill] ${done}/${ids.length} (${rate}/s, updated=${updated})`);
    }
  }
  console.log(`[backfill] done in ${Math.round((Date.now() - t0) / 1000)}s, updated=${updated}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

import { getDb } from "../src/lib/db.js";
import { searchAppCandidates } from "../src/services/app-query.js";
import { apps, appSnapshots } from "@kittie/db";
import { and, count, desc, eq, gte } from "drizzle-orm";

const RA = Math.floor(Date.now() / 1000) - 604_800;

async function latestDate() {
  const rows = await getDb()
    .select({ d: appSnapshots.snapshotDate, c: count() })
    .from(appSnapshots)
    .where(eq(appSnapshots.chartCountry, "US"))
    .groupBy(appSnapshots.snapshotDate)
    .orderBy(desc(appSnapshots.snapshotDate))
    .limit(14);
  return rows;
}

async function main() {
  console.time("latestDate");
  const dates = await latestDate();
  console.timeEnd("latestDate");
  console.log("top dates", dates.slice(0, 3));

  console.time("countApps");
  const [c] = await getDb()
    .select({ c: count() })
    .from(apps)
    .where(gte(apps.releasedAt, new Date(RA * 1000)));
  console.timeEnd("countApps");
  console.log("released7d", c?.c);

  const maxDate = dates.find((r) => r.c >= 800_000)?.d ?? dates[0]?.d;
  console.time("selectJoin");
  const sel = await getDb()
    .select({ id: apps.id })
    .from(apps)
    .innerJoin(appSnapshots, eq(appSnapshots.appId, apps.id))
    .where(
      and(
        eq(appSnapshots.snapshotDate, maxDate!),
        eq(appSnapshots.chartCountry, "US"),
        gte(apps.releasedAt, new Date(RA * 1000)),
      ),
    )
    .orderBy(desc(appSnapshots.reviewCount), apps.id)
    .limit(400);
  console.timeEnd("selectJoin");
  console.log("selectJoin rows", sel.length, "maxDate", maxDate);

  for (let i = 1; i <= 3; i++) {
    console.time(`searchAppCandidates_${i}`);
    const pool = await searchAppCandidates({ sortBy: "reviews", sortOrder: "desc", releasedAfter: RA });
    console.timeEnd(`searchAppCandidates_${i}`);
    console.log(`  pool ${pool?.ids.length} total ${pool?.totalCount}`);
  }
}

main().catch(console.error);

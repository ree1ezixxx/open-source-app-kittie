import { and, eq } from "drizzle-orm";
import type { TopChartsResult } from "@kittie/types";
import type { Db } from "../client.js";
import { apps, appSnapshots, chartRankings } from "../schema.js";
import { assembleTopCharts, type ChartRow, type TopChartsParams } from "./charts.js";

/**
 * Database shell for {@link assembleTopCharts}. Loads the store+country
 * leaderboards from the dedicated `chart_rankings` table (one row per
 * app/chart/day, so an app on several charts is held without collision) and
 * joins each app's same-day metric snapshot for review/rating/estimates. A small
 * set — only chart rows across a handful of recent dates — handed to the pure
 * assembler, which picks the requested (type, genre) chart and its clean prior
 * day. Kept separate from `charts.ts` so the ranking/delta logic stays DB-free.
 */
export async function getTopCharts(
  db: Db,
  params: TopChartsParams,
): Promise<TopChartsResult> {
  const country = params.country ?? "US";
  const rows = await db
    .select({
      appId: chartRankings.appId,
      snapshotDate: chartRankings.snapshotDate,
      chartRank: chartRankings.rank,
      chartCategory: chartRankings.chartCategory,
      rating: appSnapshots.rating,
      reviewCount: appSnapshots.reviewCount,
      downloadsEstimate: appSnapshots.downloadsEstimate,
      revenueEstimate: appSnapshots.revenueEstimate,
      app: {
        id: apps.id,
        store: apps.store,
        storeAppId: apps.storeAppId,
        title: apps.title,
        developer: apps.developer,
        iconUrl: apps.iconUrl,
        category: apps.category,
      },
    })
    .from(chartRankings)
    .innerJoin(apps, eq(chartRankings.appId, apps.id))
    // Metric values live on the per-day snapshot for the same market; LEFT so a
    // freshly-charted app with no metric snapshot yet still shows (estimates are
    // recomputed live downstream).
    .leftJoin(
      appSnapshots,
      and(
        eq(appSnapshots.appId, chartRankings.appId),
        eq(appSnapshots.snapshotDate, chartRankings.snapshotDate),
        eq(appSnapshots.chartCountry, country),
      ),
    )
    .where(and(eq(apps.store, params.store), eq(chartRankings.country, country)));

  const chartRows: ChartRow[] = rows.map((r) => ({
    appId: r.appId,
    snapshotDate: r.snapshotDate,
    chartRank: r.chartRank,
    chartCategory: r.chartCategory,
    rating: r.rating,
    reviewCount: r.reviewCount ?? 0,
    downloadsEstimate: r.downloadsEstimate,
    revenueEstimate: r.revenueEstimate,
    app: r.app,
  }));

  return assembleTopCharts(chartRows, params);
}

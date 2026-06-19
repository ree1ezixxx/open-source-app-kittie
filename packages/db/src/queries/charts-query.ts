import { and, eq, isNotNull } from "drizzle-orm";
import type { TopChartsResult } from "@kittie/types";
import type { Db } from "../client.js";
import { apps, appSnapshots } from "../schema.js";
import { assembleTopCharts, type ChartRow, type TopChartsParams } from "./charts.js";

/**
 * Database shell for {@link assembleTopCharts}. Loads the chart-bearing
 * snapshots for the store+country (a small set — only chart-ranked rows across
 * a handful of dates) and hands them to the pure assembler. Kept separate from
 * `charts.ts` so the ranking/delta logic stays DB-free and unit-testable.
 */
export async function getTopCharts(
  db: Db,
  params: TopChartsParams,
): Promise<TopChartsResult> {
  const country = params.country ?? "US";
  const rows = await db
    .select({
      appId: appSnapshots.appId,
      snapshotDate: appSnapshots.snapshotDate,
      chartRank: appSnapshots.chartRank,
      chartCategory: appSnapshots.chartCategory,
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
    .from(appSnapshots)
    .innerJoin(apps, eq(appSnapshots.appId, apps.id))
    .where(
      // No `apps.category` filter: the chart's genre lives in `chart_category`
      // (resolved by the assembler), not the app's listed category. We load every
      // chart-ranked row for the store+country (a small set) and let assembleTopCharts
      // pick the requested (type, genre) chart and its clean prior day.
      and(
        eq(apps.store, params.store),
        eq(appSnapshots.chartCountry, country),
        isNotNull(appSnapshots.chartRank),
      ),
    );

  // chartRank is non-null here (filtered above); narrow for the pure assembler.
  const chartRows: ChartRow[] = rows.map((r) => ({
    appId: r.appId,
    snapshotDate: r.snapshotDate,
    chartRank: r.chartRank as number,
    chartCategory: r.chartCategory,
    rating: r.rating,
    reviewCount: r.reviewCount,
    downloadsEstimate: r.downloadsEstimate,
    revenueEstimate: r.revenueEstimate,
    app: r.app,
  }));

  return assembleTopCharts(chartRows, params);
}

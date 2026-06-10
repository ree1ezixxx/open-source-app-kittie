import { and, eq } from "drizzle-orm";
import {
  computeGrowthScore,
  estimateDownloads,
  estimateRevenue,
  isFirstMover,
} from "@kittie/intelligence";
import type { AppSignals } from "@kittie/intelligence";
import type { GrowthPeriod } from "@kittie/types";
import type { Db } from "../client.js";
import { appSnapshots } from "../schema.js";
import { getSnapshotContext, type SnapshotContext } from "./signals.js";

function toSignals(ctx: SnapshotContext): AppSignals {
  return {
    category: ctx.app.category,
    chartRank: ctx.latest.chartRank,
    reviewCount: ctx.latest.reviewCount,
    reviewCountPrior: ctx.prior?.reviewCount ?? null,
    rating: ctx.latest.rating,
    iapCount: ctx.iapCount,
    metaAdCount: ctx.metaAdCount,
    metaAdCountPrior: ctx.metaAdCountPrior,
    chartRankPrior: ctx.prior?.chartRank ?? null,
    priorDays: ctx.priorDays,
    updatedAt: ctx.app.updatedAt,
    releasedAt: ctx.app.releasedAt,
    categoryAppCount: ctx.categoryAppCount,
  };
}

/** Compute MVP revenue/download/growth estimates and persist on the snapshot row. */
export async function enrichSnapshotScores(
  db: Db,
  appId: string,
  snapshotDate: string,
  period: GrowthPeriod = "7d",
): Promise<void> {
  const ctx = await getSnapshotContext(db, appId, period);
  if (!ctx) return;

  const signals = toSignals(ctx);
  const revenueEstimate = estimateRevenue(signals);
  const downloadsEstimate = estimateDownloads(signals, revenueEstimate);
  const growthScore = computeGrowthScore(signals, period);

  await db
    .update(appSnapshots)
    .set({
      revenueEstimate,
      downloadsEstimate,
      growthScore,
      isFirstMover: isFirstMover(signals, growthScore),
    })
    .where(
      and(
        eq(appSnapshots.appId, appId),
        eq(appSnapshots.snapshotDate, snapshotDate),
      ),
    );
}

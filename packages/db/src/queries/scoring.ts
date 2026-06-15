import { and, eq } from "drizzle-orm";
import {
  computeGrowthScore,
  estimateDownloads,
  estimateRevenue,
  isFirstMover,
  signalsFromContext,
} from "@kittie/intelligence";
import type { GrowthPeriod } from "@kittie/types";
import type { Db } from "../client.js";
import { appSnapshots } from "../schema.js";
import { getSnapshotContext } from "./signals.js";

/** Compute MVP revenue/download/growth estimates and persist on the snapshot row. */
export async function enrichSnapshotScores(
  db: Db,
  appId: string,
  snapshotDate: string,
  period: GrowthPeriod = "7d",
): Promise<void> {
  const ctx = await getSnapshotContext(db, appId, period);
  if (!ctx) return;

  const signals = signalsFromContext(ctx);
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

import type { AppSignals } from "./types.js";
import type { SnapshotContext } from "@kittie/db";

/** Map DB snapshot context into scoring inputs. */
export function signalsFromContext(ctx: SnapshotContext): AppSignals {
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

import {
  appsWithAppleAds,
  appsWithCreators,
  buildSnapshotContextsForApps,
  parseJsonArray,
  type SnapshotContext,
} from "@kittie/db";
import {
  computeGrowthPct,
  computeGrowthScore,
  isFirstMover,
  priorEstimates,
  scoreApp,
  signalsFromContext,
} from "@kittie/intelligence";
import type { AppListItem, GrowthPeriod } from "@kittie/types";
import { getDb } from "../lib/db.js";
import type { ScoredAppRow } from "./filter-sort.js";

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function listItemFromContext(
  ctx: SnapshotContext,
  period: GrowthPeriod,
  rankDelta: number | null,
): AppListItem {
  const reviewGrowth7d =
    ctx.prior != null ? ctx.latest.reviewCount - ctx.prior.reviewCount : null;

  const base = {
    id: ctx.app.id,
    store: ctx.app.store,
    storeAppId: ctx.app.storeAppId,
    title: ctx.app.title,
    iconUrl: ctx.app.iconUrl,
    developer: ctx.app.developer,
    category: ctx.app.category,
    rating: ctx.latest.rating,
    reviewCount: ctx.latest.reviewCount,
    releasedAt: toIso(ctx.app.releasedAt),
    updatedAt: toIso(ctx.app.updatedAt),
  };

  if (ctx.latest.revenueEstimate != null && ctx.latest.growthScore != null) {
    const signals = signalsFromContext(ctx);
    const growthScore = computeGrowthScore(signals, period);
    return {
      ...base,
      reviewGrowth7d,
      downloadsEstimate30d: ctx.latest.downloadsEstimate,
      revenueEstimate30d: ctx.latest.revenueEstimate,
      growthScore,
      growthPct: computeGrowthPct(signals, period),
      ...priorEstimates(signals),
      rankDelta,
      isFirstMover: isFirstMover(signals, growthScore),
    };
  }

  return { ...scoreApp(base, signalsFromContext(ctx)), rankDelta };
}

export function filterMetaFromContext(ctx: SnapshotContext): ScoredAppRow["meta"] {
  return {
    hasMetaAds: ctx.metaAdCount > 0,
    hasAppleAds: false,
    hasCreators: false,
    hasEmail: Boolean(ctx.app.supportEmail),
    hasWebsite: Boolean(ctx.app.websiteUrl),
    price: ctx.app.price,
    languages: parseJsonArray(ctx.app.languages).map((l) => l.toLowerCase()),
    description: ctx.app.description,
  };
}

/** Score a bounded candidate pool into list rows + filter metadata. */
export async function buildScoredAppRows(
  ids: string[],
  period: GrowthPeriod,
  country: string,
  rankDeltas: Map<string, number | null>,
): Promise<ScoredAppRow[]> {
  if (!ids.length) return [];

  const db = getDb();
  const [contexts, appleAdApps, creatorApps] = await Promise.all([
    buildSnapshotContextsForApps(db, { appIds: ids, period, chartCountry: country }),
    appsWithAppleAds(db),
    appsWithCreators(db),
  ]);

  const rows: ScoredAppRow[] = [];
  for (const id of ids) {
    const ctx = contexts.get(id);
    if (!ctx) continue;
    const meta = filterMetaFromContext(ctx);
    meta.hasAppleAds = appleAdApps.has(id);
    meta.hasCreators = creatorApps.has(id);
    rows.push({
      item: listItemFromContext(ctx, period, rankDeltas.get(id) ?? null),
      meta,
    });
  }
  return rows;
}

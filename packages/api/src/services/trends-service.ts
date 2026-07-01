import { appSnapshots } from "@kittie/db";
import {
  buildCategoryPulseResponse,
  type CategoryPulseAppInput,
} from "@kittie/intelligence";
import type { GrowthPeriod, IntelligenceResponseEnvelope, TrendsResponseData } from "@kittie/types";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../lib/db.js";
import { dbHasApps, searchAppsFromDb } from "./db-app-service.js";

export interface CategoryPulseParams {
  category?: string;
  country: string;
  growthPeriod: GrowthPeriod;
  limit: number;
}

export async function getCategoryPulse(
  params: CategoryPulseParams,
): Promise<IntelligenceResponseEnvelope<TrendsResponseData, "trends">> {
  const snapshotDate = await latestSnapshotDateForCountry(params.country);
  if (!(await dbHasApps())) {
    return buildCategoryPulseResponse({
      category: params.category ?? null,
      country: params.country,
      growthPeriod: params.growthPeriod,
      limit: params.limit,
      apps: [],
      snapshotDate: null,
      generatedAt: new Date().toISOString(),
    });
  }

  const result = await searchAppsFromDb({
    categories: params.category,
    countries: params.country,
    growthPeriod: params.growthPeriod,
    sortBy: "growth",
    sortOrder: "desc",
    limit: params.limit,
  });

  return buildCategoryPulseResponse({
    category: params.category ?? null,
    country: params.country,
    growthPeriod: params.growthPeriod,
    limit: params.limit,
    apps: result.data.map<CategoryPulseAppInput>((app) => ({
      id: app.id,
      store: app.store,
      title: app.title,
      developer: app.developer,
      category: app.category,
      rating: app.rating,
      reviewCount: app.reviewCount,
      reviewGrowth7d: app.reviewGrowth7d,
      growthPct: app.growthPct,
      growthScore: app.growthScore,
      rankDelta: app.rankDelta,
    })),
    snapshotDate,
    generatedAt: new Date().toISOString(),
  });
}

async function latestSnapshotDateForCountry(country: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ snapshotDate: appSnapshots.snapshotDate })
    .from(appSnapshots)
    .where(eq(appSnapshots.chartCountry, country))
    .orderBy(desc(appSnapshots.snapshotDate))
    .limit(1);
  return row?.snapshotDate ?? null;
}

import type { AppSearchParams } from "@kittie/types";
import { dbHasApps, listCategoryFacetsFromDb, searchAppsFromDb } from "./db-app-service.js";

/** Pre-materialise the queries Pulse + Explore hit on first paint (cold SQLite ~0.5–3s each). */
export function warmLandingReadCaches(): void {
  void (async () => {
    if (!(await dbHasApps())) return;

    const releasedAfter = Math.floor((Date.now() - 7 * 86_400_000) / 1000);
    const queries: AppSearchParams[] = [
      { growthPeriod: "7d", sortBy: "revenue", sortOrder: "desc", limit: 50 },
      { sortBy: "reviews", sortOrder: "desc", releasedAfter, limit: 50 },
      { sortBy: "rankDelta", sortOrder: "desc", limit: 50 },
      { sortBy: "rankDelta", sortOrder: "asc", limit: 50 },
    ];

    const t0 = Date.now();
    for (const q of queries) {
      try {
        await searchAppsFromDb(q);
      } catch {
        /* non-fatal — serving still works, first request pays cold cost */
      }
    }
    try {
      await listCategoryFacetsFromDb();
    } catch {
      /* same */
    }
    console.log(`[warm] landing read caches ready in ${Date.now() - t0}ms`);
  })();
}

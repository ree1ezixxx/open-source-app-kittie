import { landingWarmQueries } from "@kittie/types";
import { dbHasApps, listCategoryFacetsFromDb, searchAppsFromDb } from "./db-app-service.js";

/** Pre-materialise the queries Pulse + Explore hit on first paint (cold SQLite ~0.5–3s each). */
export function warmLandingReadCaches(): void {
  void (async () => {
    if (!(await dbHasApps())) return;

    const t0 = Date.now();
    for (const q of landingWarmQueries()) {
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

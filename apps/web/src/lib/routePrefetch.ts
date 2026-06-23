import { pulseAppQueries } from "@kittie/types";
import { prefetchApps } from "../hooks/useApps";
import { listCategories, listCharts } from "./api";
import { defaultExploreApiParams } from "./exploreFilters";

function prefetchPulse(): void {
  for (const q of pulseAppQueries()) prefetchApps(q);
}

/** Warm reads for the current route; returns an idle-callback / timer cleanup. */
export function prefetchForRoute(pathname: string): () => void {
  const onPulse = pathname.startsWith("/dashboard/pulse") || pathname === "/";
  const onExplore = pathname.startsWith("/dashboard/explore");
  const onTrending = pathname.startsWith("/dashboard/trending");

  if (onPulse) prefetchPulse();
  else if (onExplore) {
    prefetchApps(defaultExploreApiParams());
    listCategories().catch(() => {});
  }

  const warmSecondary = () => {
    if (!onExplore) prefetchApps(defaultExploreApiParams());
    if (!onPulse) prefetchPulse();
    if (onTrending) {
      listCharts({ store: "apple", type: "free", country: "US", limit: 100 }).catch(() => {});
    }
  };

  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(warmSecondary, { timeout: 5000 });
    return () => cancelIdleCallback(id);
  }
  const t = setTimeout(warmSecondary, 2500);
  return () => clearTimeout(t);
}

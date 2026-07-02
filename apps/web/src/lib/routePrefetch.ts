import { pulseAppQueries } from "@kittie/types";
import { prefetchApps } from "../hooks/useApps";

/** Warm reads for the current route; returns an idle-callback / timer cleanup.
 *  Only the retained Pulse route has a catalog prefetch — the old dashboard
 *  warmers (Explore/Trending) were removed with those surfaces (#239). */
export function prefetchForRoute(pathname: string): () => void {
  if (!pathname.startsWith("/dashboard/pulse")) return () => {};

  const warm = () => {
    for (const q of pulseAppQueries()) prefetchApps(q);
  };
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(warm, { timeout: 5000 });
    return () => cancelIdleCallback(id);
  }
  const t = setTimeout(warm, 2500);
  return () => clearTimeout(t);
}

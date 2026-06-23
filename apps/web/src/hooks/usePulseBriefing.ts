import { useMemo } from "react";
import { pulseAppQueries } from "@kittie/types";
import { useApps } from "./useApps";

/** Pulse home — three ranked slices from existing snapshot data. */
export function usePulseBriefing() {
  const [bigHitsParams, gainersParams, losersParams] = useMemo(() => pulseAppQueries(), []);
  const bigHits = useApps(bigHitsParams);
  const gainers = useApps(gainersParams);
  const losers = useApps(losersParams);
  return { bigHits, gainers, losers };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";
import { listApps } from "../lib/api";
import { createQueryCache } from "../lib/queryCache";

const PAGE = 50;
const CACHE_TTL_MS = 5 * 60_000;
const appsCache = createQueryCache<PaginatedResponse<AppListItem>>(CACHE_TTL_MS);

/**
 * Page-based fetching for the apps table. The REST API is cursor-paginated, so we
 * keep a cursor-per-page stack (cursorsRef) built up as the user pages forward —
 * enough for Prev/Next + "page x of y" without needing offset support server-side.
 *
 * Responses are cached client-side (5 min) so tab switches and back-navigation
 * show the last result instantly while revalidating in the background.
 */
export function useApps(params: AppSearchParams) {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const cursorsRef = useRef<(string | undefined)[]>([undefined]);
  const keyRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  const key = JSON.stringify(params);

  useEffect(() => {
    // reset pagination when the query changes; re-run at page 0
    if (keyRef.current !== key) {
      keyRef.current = key;
      cursorsRef.current = [undefined];
      if (page !== 0) {
        setPage(0);
        return;
      }
    }

    const cacheKey = `${key}::${page}`;
    const cached = appsCache.get(cacheKey);
    if (cached) {
      setApps(cached.data);
      setTotal(cached.pagination.totalCount);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    listApps({ ...params, limit: params.limit ?? PAGE, cursor: cursorsRef.current[page] }, ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return;
        appsCache.set(cacheKey, res);
        setApps(res.data);
        setTotal(res.pagination.totalCount);
        if (res.pagination.nextCursor && cursorsRef.current[page + 1] === undefined) {
          cursorsRef.current[page + 1] = res.pagination.nextCursor;
        }
        setLoading(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted || (e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, tick]);

  const totalPages = Math.max(1, Math.ceil(total / (params.limit ?? PAGE)));
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  return {
    apps,
    total,
    page,
    totalPages,
    pageSize: params.limit ?? PAGE,
    loading,
    error,
    hasNext,
    hasPrev,
    next: useCallback(() => setPage((p) => (p < totalPages - 1 ? p + 1 : p)), [totalPages]),
    prev: useCallback(() => setPage((p) => (p > 0 ? p - 1 : p)), []),
    refresh: useCallback(() => {
      appsCache.clear();
      setTick((t) => t + 1);
    }, []),
  };
}

export function prefetchApps(params: AppSearchParams, page = 0): void {
  const key = JSON.stringify(params);
  const cacheKey = `${key}::${page}`;
  if (appsCache.get(cacheKey)) return;
  listApps({ ...params, limit: params.limit ?? PAGE, cursor: undefined })
    .then((res) => appsCache.set(cacheKey, res))
    .catch(() => {});
}

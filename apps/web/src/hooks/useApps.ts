import { useCallback, useEffect, useRef, useState } from "react";
import type { AppListItem, AppSearchParams, PaginatedResponse } from "@kittie/types";
import { listApps } from "../lib/api";
import { createQueryCache } from "../lib/queryCache";

const PAGE = 50;
const CACHE_TTL_MS = 5 * 60_000;
const appsCache = createQueryCache<PaginatedResponse<AppListItem>>(CACHE_TTL_MS);
const appsInflight = new Map<string, Promise<PaginatedResponse<AppListItem>>>();

function cacheKeyFor(paramsKey: string, page: number): string {
  return `${paramsKey}::${page}`;
}

/** Deduped fetch — concurrent prefetch + useApps share one in-flight request per key. */
function loadAppsPage(
  paramsKey: string,
  page: number,
  params: AppSearchParams,
  cursor?: string,
): Promise<PaginatedResponse<AppListItem>> {
  const cacheKey = cacheKeyFor(paramsKey, page);
  const cached = appsCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  let inflight = appsInflight.get(cacheKey);
  if (!inflight) {
    inflight = listApps({ ...params, limit: params.limit ?? PAGE, cursor })
      .then((res) => {
        appsCache.set(cacheKey, res);
        return res;
      })
      .finally(() => {
        appsInflight.delete(cacheKey);
      });
    appsInflight.set(cacheKey, inflight);
  }
  return inflight;
}

/**
 * Page-based fetching for the apps table. The REST API is cursor-paginated, so we
 * keep a cursor-per-page stack (cursorsRef) built up as the user pages forward —
 * enough for Prev/Next + "page x of y" without needing offset support server-side.
 *
 * Responses are cached client-side (5 min). Cache hits skip the network entirely.
 */
export function useApps(params: AppSearchParams) {
  const key = JSON.stringify(params);
  const initial = appsCache.get(cacheKeyFor(key, 0));

  const [apps, setApps] = useState<AppListItem[]>(() => initial?.data ?? []);
  const [total, setTotal] = useState(() => initial?.pagination.totalCount ?? 0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const cursorsRef = useRef<(string | undefined)[]>([undefined]);
  const keyRef = useRef("");

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      cursorsRef.current = [undefined];
      if (page !== 0) {
        setPage(0);
        return;
      }
    }

    const cacheKey = cacheKeyFor(key, page);
    const cached = appsCache.get(cacheKey);
    if (cached) {
      setApps(cached.data);
      setTotal(cached.pagination.totalCount);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    let cancelled = false;

    loadAppsPage(key, page, params, cursorsRef.current[page])
      .then((res) => {
        if (cancelled) return;
        setApps(res.data);
        setTotal(res.pagination.totalCount);
        if (res.pagination.nextCursor && cursorsRef.current[page + 1] === undefined) {
          cursorsRef.current[page + 1] = res.pagination.nextCursor;
        }
        setLoading(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
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
      appsInflight.clear();
      setTick((t) => t + 1);
    }, []),
  };
}

export function prefetchApps(params: AppSearchParams, page = 0): void {
  const key = JSON.stringify(params);
  const cacheKey = cacheKeyFor(key, page);
  if (appsCache.get(cacheKey) || appsInflight.has(cacheKey)) return;
  void loadAppsPage(key, page, params).catch(() => {});
}

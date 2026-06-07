import { useCallback, useEffect, useRef, useState } from "react";
import type { AppListItem, AppSearchParams } from "@kittie/types";
import { listApps } from "../lib/api";

const PAGE = 50;

export function useApps(params: AppSearchParams) {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // serialize params so the effect only fires on real changes
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await listApps({ ...params, limit: PAGE }, ac.signal);
      setApps(res.data);
      setTotal(res.pagination.totalCount);
      setCursor(res.pagination.nextCursor);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listApps({ ...params, limit: PAGE, cursor });
      setApps((prev) => [...prev, ...res.data]);
      setCursor(res.pagination.nextCursor);
    } catch {
      /* keep existing list on a failed page fetch */
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loadingMore, key]);

  return { apps, total, loading, loadingMore, error, hasMore: !!cursor, loadMore, refresh: load };
}

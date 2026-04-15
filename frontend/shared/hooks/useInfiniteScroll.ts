import { useState, useEffect, useCallback, useRef } from "react";
import type { AxiosInstance } from "axios";

interface UseInfiniteScrollConfig {
  api: AxiosInstance;
  url: string;
  perPage?: number;
  /** params must be memoized (useMemo) to prevent re-fetches on every render */
  params?: Record<string, any>;
  enabled?: boolean;
}

interface UseInfiniteScrollReturn<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;
  total: number;
  loadMore: () => void;
  refresh: () => void;
  sentinelRef: (node: HTMLElement | null) => void;
}

export function useInfiniteScroll<T>(
  config: UseInfiniteScrollConfig
): UseInfiniteScrollReturn<T> {
  const { api, url, perPage = 20, params = {}, enabled = true } = config;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const backoffRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasMore = page < totalPages;

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!enabled) return;
      const id = ++fetchRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const { data } = await api.get(url, {
          params: { ...params, page: pageNum, per_page: perPage },
        });

        if (id !== fetchRef.current) return;

        const newItems = data.data ?? data.rows ?? [];
        const meta = data.meta ?? data.pagination ?? {};

        if (append) {
          setItems((prev) => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }

        setTotal(meta.total ?? 0);
        setTotalPages(meta.total_pages ?? meta.last_page ?? 1);
        backoffRef.current = 0;
      } catch (err: any) {
        if (id !== fetchRef.current) return;
        setError(err?.message ?? "Failed to load");

        // Exponential backoff on error (max 30s)
        backoffRef.current = Math.min((backoffRef.current || 1) * 2, 30);
      } finally {
        if (id === fetchRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [api, url, perPage, params, enabled]
  );

  // Initial load
  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;

    if (backoffRef.current > 0) {
      backoffTimerRef.current = setTimeout(() => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchPage(nextPage, true);
      }, backoffRef.current * 1000);
      return;
    }

    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  }, [loadingMore, hasMore, page, fetchPage]);

  const refresh = useCallback(() => {
    backoffRef.current = 0;
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  // IntersectionObserver sentinel ref — auto-loads when sentinel enters viewport
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !loadingMore && !loading) {
            loadMore();
          }
        },
        { rootMargin: "200px" }
      );

      observerRef.current.observe(node);
    },
    [hasMore, loadingMore, loading, loadMore]
  );

  // Cleanup observer + backoff timer
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      if (backoffTimerRef.current) clearTimeout(backoffTimerRef.current);
    };
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    page,
    total,
    loadMore,
    refresh,
    sentinelRef,
  };
}

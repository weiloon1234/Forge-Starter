import type {
  DataTableFilter,
  DataTableMeta,
  DataTableSort,
} from "@shared/types/form";
import { getCookie, setCookie } from "@shared/utils/cookie";
import type { AxiosInstance } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseDataTableConfig {
  api: AxiosInstance;
  url: string;
  baseFilters?: DataTableFilter[];
  defaultPerPage?: number;
}

interface UseDataTableReturn<T> {
  rows: T[];
  meta: DataTableMeta | null;
  loading: boolean;
  error: string | null;
  page: number;
  perPage: number;
  sorts: DataTableSort[];
  filters: DataTableFilter[];
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  toggleSort: (field: string, multi?: boolean) => void;
  setFilters: (filters: DataTableFilter[]) => void;
  refresh: () => void;
}

const COOKIE_PREFIX = "dt_autorefresh_";
const EMPTY_FILTERS: DataTableFilter[] = [];

export { COOKIE_PREFIX, getCookie, setCookie };

export function serializeSorts(sorts: DataTableSort[]): DataTableSort[] {
  return sorts.map((s) => ({ field: s.field, direction: s.direction }));
}

export function useDataTable<T>(
  config: UseDataTableConfig,
): UseDataTableReturn<T> {
  const { api, url, baseFilters = EMPTY_FILTERS, defaultPerPage = 20 } = config;

  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<DataTableMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [sorts, setSorts] = useState<DataTableSort[]>([]);
  const [filters, setFilters] = useState<DataTableFilter[]>([]);

  const fetchRef = useRef(0);

  const fetch = useCallback(async () => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, number | string> = {
        page,
        per_page: perPage,
      };

      if (sorts.length > 0) {
        params.sort = JSON.stringify(serializeSorts(sorts));
      }
      const combinedFilters = [...baseFilters, ...filters];
      if (combinedFilters.length > 0) {
        params.filters = JSON.stringify(combinedFilters);
      }

      const { data } = await api.get(url, { params });

      if (id !== fetchRef.current) return; // stale

      setRows(data.rows ?? []);
      setMeta({
        columns: data.columns ?? [],
        pagination: data.pagination ?? {
          page: 1,
          per_page: perPage,
          total: 0,
          total_pages: 0,
        },
        filters: data.filters ?? [],
        applied_filters: data.applied_filters ?? [],
        sorts: data.sorts ?? [],
      });
    } catch (err: unknown) {
      if (id !== fetchRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [api, url, page, perPage, sorts, filters, baseFilters]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const fetchLatestRef = useRef(fetch);
  useEffect(() => {
    fetchLatestRef.current = fetch;
  }, [fetch]);
  const refresh = useCallback(() => fetchLatestRef.current(), []);

  const toggleSort = useCallback((field: string, multi = false) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.field === field);
      if (existing) {
        if (existing.direction === "asc") {
          return multi
            ? prev.map((s) =>
                s.field === field ? { ...s, direction: "desc" as const } : s,
              )
            : [{ field, direction: "desc" as const }];
        }
        // desc → remove
        return multi ? prev.filter((s) => s.field !== field) : [];
      }
      // add new asc
      return multi
        ? [...prev, { field, direction: "asc" as const }]
        : [{ field, direction: "asc" as const }];
    });
    setPage(1);
  }, []);

  const handleSetPerPage = useCallback((newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1);
  }, []);

  return {
    rows,
    meta,
    loading,
    error,
    page,
    perPage,
    sorts,
    filters,
    setPage,
    setPerPage: handleSetPerPage,
    toggleSort,
    setFilters,
    refresh,
  };
}

import { useState, useEffect, useCallback, useRef } from "react";
import type { AxiosInstance } from "axios";
import type { DataTableSort, DataTableFilter, DataTableMeta } from "../types/form";
import { getCookie, setCookie } from "../utils/cookie";

interface UseDataTableConfig {
  api: AxiosInstance;
  url: string;
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

export { getCookie, setCookie, COOKIE_PREFIX };

export function serializeSorts(sorts: DataTableSort[]): any[] {
  return sorts.map(s => ({ field: s.field, direction: s.direction === "asc" ? "Asc" : "Desc" }));
}

export function useDataTable<T>(config: UseDataTableConfig): UseDataTableReturn<T> {
  const { api, url, defaultPerPage = 20 } = config;

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
      const params: Record<string, any> = { page, per_page: perPage };

      if (sorts.length > 0) {
        params.sort = JSON.stringify(serializeSorts(sorts));
      }
      if (filters.length > 0) {
        params.filters = JSON.stringify(filters);
      }

      const { data } = await api.get(url, { params });

      if (id !== fetchRef.current) return; // stale

      setRows(data.rows ?? []);
      setMeta({
        columns: data.columns ?? [],
        pagination: data.pagination ?? { page: 1, per_page: perPage, total: 0, total_pages: 0 },
        filters: data.filters ?? [],
        applied_filters: data.applied_filters ?? [],
        sorts: data.sorts ?? [],
      });
    } catch (err: any) {
      if (id !== fetchRef.current) return;
      setError(err?.message ?? "Failed to load data");
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [api, url, page, perPage, sorts, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleSort = useCallback((field: string, multi = false) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.field === field);
      if (existing) {
        if (existing.direction === "asc") {
          return multi
            ? prev.map((s) => (s.field === field ? { ...s, direction: "desc" as const } : s))
            : [{ field, direction: "desc" as const }];
        }
        // desc → remove
        return multi ? prev.filter((s) => s.field !== field) : [];
      }
      // add new asc
      return multi ? [...prev, { field, direction: "asc" as const }] : [{ field, direction: "asc" as const }];
    });
    setPage(1);
  }, []);

  const handleSetPerPage = useCallback((newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1);
  }, []);

  return {
    rows, meta, loading, error,
    page, perPage, sorts, filters,
    setPage, setPerPage: handleSetPerPage, toggleSort, setFilters,
    refresh: fetch,
  };
}

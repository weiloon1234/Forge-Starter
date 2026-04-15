import { useState, useEffect, useCallback } from "react";
import type { AxiosInstance } from "axios";
import { ChevronUp, ChevronDown, Download, RefreshCw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { useDataTable, serializeSorts } from "../hooks/useDataTable";
import { getCookie, setCookie } from "../hooks/useDataTable";
import type { DataTableProps, DataTableColumn, DataTableFilter } from "../types/form";

interface Props<T> extends DataTableProps<T> {
  api: AxiosInstance;
}

export function DataTable<T>({
  api,
  url,
  title,
  subtitle,
  columns,
  downloadUrl,
  exportUrl,
  refreshInterval,
  defaultPerPage = 20,
  footerSums,
  className,
}: Props<T>) {
  const {
    rows, meta, loading, error,
    page, perPage, sorts, filters,
    setPage, setPerPage, toggleSort, setFilters,
    refresh,
  } = useDataTable<T>({ api, url, defaultPerPage });

  // ── Auto-refresh ────────────────────────────────────────

  const cookieKey = `dt_autorefresh_${url}`;
  const [autoRefresh, setAutoRefresh] = useState(() => getCookie(cookieKey) === "1");

  useEffect(() => {
    setCookie(cookieKey, autoRefresh ? "1" : "0");
    if (!autoRefresh || !refreshInterval) return;
    const timer = setInterval(refresh, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, refresh, cookieKey]);

  // ── Filter state (local inputs before applying) ─────────

  const [filterValues, setFilterValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!meta?.applied_filters) return;
    const applied: Record<string, any> = {};
    for (const af of meta.applied_filters) {
      applied[af.field] = af.value;
    }
    setFilterValues(applied);
  }, [meta?.applied_filters]);

  const applyFilterChange = useCallback((field: string, value: any) => {
    setFilterValues((prev) => {
      const next = { ...prev, [field]: value };
      const active: DataTableFilter[] = [];
      for (const [f, v] of Object.entries(next)) {
        if (v === "" || v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        active.push({ field: f, op: typeof v === "boolean" ? "Eq" : "Like", value: v });
      }
      setFilters(active);
      return next;
    });
    setPage(1);
  }, [setFilters, setPage]);

  // ── Download ────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!downloadUrl) return;
    const params: Record<string, any> = {};
    if (sorts.length > 0) {
      params.sort = JSON.stringify(serializeSorts(sorts));
    }
    if (filters.length > 0) {
      params.filters = JSON.stringify(filters);
    }
    const { data } = await api.get(downloadUrl, { params, responseType: "blob" });
    const blobUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "export.xlsx";
    a.click();
    URL.revokeObjectURL(blobUrl);
  }, [api, downloadUrl, sorts, filters]);

  // ── Pagination helpers ──────────────────────────────────

  const totalPages = meta?.pagination.total_pages ?? 0;
  const total = meta?.pagination.total ?? 0;

  const pageNumbers = (() => {
    const pages: number[] = [];
    const range = 2;
    const start = Math.max(1, page - range);
    const end = Math.min(totalPages, page + range);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  // ── Sort helpers ────────────────────────────────────────

  const getSortDirection = (field: string): "asc" | "desc" | null => {
    const s = sorts.find(s => s.field === field);
    return s ? s.direction : null;
  };

  // ── Footer detection ────────────────────────────────────

  const hasFooter = columns.some(col =>
    col.footer || (footerSums && footerSums.includes(String(col.key)))
  );

  // ── Render filters ─────────────────────────────────────

  // Filter inputs use native elements intentionally — these are internal to the
  // DataTable component, not page-level form fields. Shared form components
  // (Input, Select, Checkbox) carry labels, margins, and field wrappers that
  // don't fit inline filter cells in a table header.
  const renderFilter = (filter: any) => {
    const value = filterValues[filter.field] ?? "";

    if (filter.kind === "select" || filter.options) {
      return (
        <div key={filter.field} className="sf-datatable-filter">
          <label className="sf-datatable-filter-label">{filter.label}</label>
          <select
            className="sf-datatable-filter-select"
            value={value}
            onChange={(e) => applyFilterChange(filter.field, e.target.value)}
          >
            <option value="">All</option>
            {(filter.options ?? []).map((opt: any) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }

    if (filter.kind === "checkbox" || filter.kind === "boolean") {
      return (
        <div key={filter.field} className="sf-datatable-filter">
          <label className="sf-datatable-filter-label">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => applyFilterChange(filter.field, e.target.checked)}
            />
            {" "}{filter.label}
          </label>
        </div>
      );
    }

    // Default: text input (applies on Enter)
    return (
      <div key={filter.field} className="sf-datatable-filter">
        <label className="sf-datatable-filter-label">{filter.label}</label>
        <input
          type="text"
          className="sf-datatable-filter-input"
          value={value}
          placeholder={filter.placeholder ?? ""}
          onChange={(e) => setFilterValues(prev => ({ ...prev, [filter.field]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") applyFilterChange(filter.field, (e.target as HTMLInputElement).value); }}
        />
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <div className={`sf-datatable ${className ?? ""}`}>
      {/* Header */}
      {(title || subtitle || downloadUrl || refreshInterval) && (
        <div className="sf-datatable-header">
          <div>
            {title && <h2 className="sf-datatable-title">{title}</h2>}
            {subtitle && <p className="sf-datatable-subtitle">{subtitle}</p>}
          </div>
          <div className="sf-datatable-controls">
            {refreshInterval && (
              <label className="sf-datatable-autorefresh">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                {" "}Auto-refresh
              </label>
            )}
            {downloadUrl && (
              <button className="sf-datatable-download" onClick={handleDownload} type="button">
                <Download size={16} />
              </button>
            )}
            <select
              className="sf-datatable-perpage"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map(n => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Filters */}
      {meta && meta.filters.length > 0 && (
        <div className="sf-datatable-filters">
          {meta.filters.map(renderFilter)}
        </div>
      )}

      {/* Table */}
      <div className="sf-datatable-table-wrapper">
        {loading && (
          <div className="sf-datatable-loading">
            <RefreshCw size={20} className="sf-datatable-loading-icon" />
          </div>
        )}
        <table className="sf-datatable-table">
          <thead className="sf-datatable-thead">
            <tr>
              {columns.map((col) => {
                const key = String(col.key);
                const dir = getSortDirection(key);
                const sorted = dir !== null;
                const thClasses = [
                  "sf-datatable-th",
                  sorted && "sf-datatable-th--sorted",
                  dir === "asc" && "sf-datatable-th--asc",
                  dir === "desc" && "sf-datatable-th--desc",
                  col.headerClassName,
                ].filter(Boolean).join(" ");

                return (
                  <th
                    key={key}
                    className={thClasses}
                    onClick={col.sortable ? (e) => toggleSort(key, e.shiftKey) : undefined}
                    style={col.sortable ? { cursor: "pointer" } : undefined}
                  >
                    <span className="sf-datatable-th-content">
                      {col.label}
                      {dir === "asc" && <ChevronUp size={14} />}
                      {dir === "desc" && <ChevronDown size={14} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="sf-datatable-tbody">
            {rows.length === 0 && !loading ? (
              <tr>
                <td className="sf-datatable-empty" colSpan={columns.length}>
                  No data
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr className="sf-datatable-tr" key={i}>
                  {columns.map((col) => {
                    const key = String(col.key);
                    return (
                      <td key={key} className={`sf-datatable-td ${col.cellClassName ?? ""}`}>
                        {col.render
                          ? col.render(row)
                          : (row as any)[key] ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {hasFooter && (
            <tfoot className="sf-datatable-tfoot">
              <tr>
                {columns.map((col) => {
                  const key = String(col.key);
                  if (col.footer) {
                    return <td key={key}>{col.footer(rows)}</td>;
                  }
                  if (footerSums?.includes(key)) {
                    const sum = rows.reduce((acc, row) => {
                      const val = Number((row as any)[key]);
                      return acc + (isNaN(val) ? 0 : val);
                    }, 0);
                    return <td key={key}>{sum}</td>;
                  }
                  return <td key={key}></td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Error */}
      {error && <div className="sf-datatable-error">{error}</div>}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="sf-datatable-pagination">
          <span className="sf-datatable-pagination-info">
            Page {page} of {totalPages} ({total} rows)
          </span>
          <div className="sf-datatable-pagination-buttons">
            <button
              className="sf-datatable-pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage(1)}
              type="button"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              className="sf-datatable-pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            {pageNumbers.map((p) => (
              <button
                key={p}
                className={`sf-datatable-pagination-btn ${p === page ? "sf-datatable-pagination-btn--active" : ""}`}
                onClick={() => setPage(p)}
                type="button"
              >
                {p}
              </button>
            ))}
            <button
              className="sf-datatable-pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="sf-datatable-pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              type="button"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

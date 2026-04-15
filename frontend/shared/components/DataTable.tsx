import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AxiosInstance } from "axios";
import { ChevronUp, ChevronDown, Download, RefreshCw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { useDataTable, serializeSorts } from "@shared/hooks/useDataTable";
import { getCookie, setCookie } from "@shared/utils/cookie";
import { Button } from "./Button";
import { Input } from "./Input";
import { Select } from "./Select";
import { Checkbox } from "./Checkbox";
import type { DataTableProps, DataTableColumn, DataTableFilter } from "@shared/types/form";

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
  refreshInterval,
  defaultPerPage = 20,
  footerSums,
  className,
  showIndex = true,
  refreshRef,
}: Props<T>) {
  const { t } = useTranslation();
  const {
    rows, meta, loading, error,
    page, perPage, sorts, filters,
    setPage, setPerPage, toggleSort, setFilters,
    refresh,
  } = useDataTable<T>({ api, url, defaultPerPage });

  useEffect(() => {
    if (refreshRef) refreshRef.current = refresh;
  }, [refresh, refreshRef]);

  // ── Auto-refresh ────────────────────────────────────────

  const interval = refreshInterval || 60;
  const cookieKey = `dt_autorefresh_${url}`;
  const [autoRefresh, setAutoRefresh] = useState(() => getCookie(cookieKey) === "1");
  const [countdown, setCountdown] = useState(interval);

  useEffect(() => {
    setCookie(cookieKey, autoRefresh ? "1" : "0");
    if (!autoRefresh) {
      setCountdown(interval);
      return;
    }

    setCountdown(interval);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refresh();
          return interval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, interval, refresh, cookieKey]);

  // ── Filter state (local inputs before applying) ─────────

  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const filterValuesRef = useRef(filterValues);
  useEffect(() => { filterValuesRef.current = filterValues; }, [filterValues]);

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

  const applyAllFilters = useCallback(() => {
    const active: DataTableFilter[] = [];
    for (const [f, v] of Object.entries(filterValuesRef.current)) {
      if (v === "" || v === null || v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      const op = typeof v === "boolean" ? "eq" : f.includes("|") ? "like_any" : "like";
      const taggedValue = typeof v === "boolean" ? { bool: v }
        : Array.isArray(v) ? { values: v }
        : { text: String(v) };
      active.push({ field: f, op, value: taggedValue });
    }
    setFilters(active);
    setPage(1);
  }, [setFilters, setPage]);

  const resetFilters = useCallback(() => {
    setFilterValues({});
    setFilters([]);
    setPage(1);
  }, [setFilters, setPage]);

  const renderFilterField = (f: any) => {
    const value = filterValues[f.name] ?? "";

    if (f.kind === "select") {
      const items = Array.isArray(f.options) ? f.options : f.options?.items ?? [];
      const options = items.map((opt: any) => ({
        value: opt.value,
        label: t(opt.label),
      }));
      return (
        <Select
          key={f.name}
          name={f.name}
          label={t(f.label)}
          value={value}
          options={options}
          placeholder={t("All")}
          clearable
          onChange={(v) => setFilterValues(prev => ({ ...prev, [f.name]: v }))}
        />
      );
    }

    if (f.kind === "checkbox" || f.kind === "boolean") {
      return (
        <Checkbox
          key={f.name}
          name={f.name}
          label={t(f.label)}
          checked={!!value}
          onChange={(v) => setFilterValues(prev => ({ ...prev, [f.name]: v }))}
        />
      );
    }

    return (
      <Input
        key={f.name}
        name={f.name}
        label={t(f.label)}
        value={value}
        placeholder={f.placeholder ? t(f.placeholder) : ""}
        onChange={(v) => setFilterValues(prev => ({ ...prev, [f.name]: v }))}
      />
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
            <label className="sf-datatable-autorefresh">
              <input
                type="checkbox"
                className="sf-checkbox-input"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              {autoRefresh ? ` ${t("refresh_in", { seconds: countdown })}` : ` ${t("auto_refresh_every", { seconds: interval })}`}
            </label>
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
              {[10, 20, 50, 100, 300, 500, 1000].map(n => (
                <option key={n} value={n}>{n} / {t("page")}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Filters */}
      {meta && meta.filters.length > 0 && (
        <div className="sf-datatable-filters">
          {meta.filters.map((row: any, ri: number) => (
            <div key={ri} className="sf-datatable-filter-row">
              {(row.fields ?? [row]).map(renderFilterField)}
            </div>
          ))}
          <div className="sf-datatable-filter-actions">
            <Button variant="primary" size="sm" onClick={applyAllFilters}>
              {t("Search")}
            </Button>
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              {t("Reset")}
            </Button>
          </div>
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
              {showIndex && <th className="sf-datatable-th sf-datatable-th--index">#</th>}
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
                <td className="sf-datatable-empty" colSpan={columns.length + (showIndex ? 1 : 0)}>
                  {t("No data")}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr className="sf-datatable-tr" key={i}>
                  {showIndex && (
                    <td className="sf-datatable-td sf-datatable-td--index">
                      {(page - 1) * perPage + i + 1}
                    </td>
                  )}
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
            {t("pagination_info", { page, totalPages, total })}
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

import { serializeSorts, useDataTable } from "@shared/hooks/useDataTable";
import type {
  DataTableFilter,
  DataTableFilterField,
  DataTableFilterInputValue,
  DataTableFilterRow,
  DataTableProps,
} from "@shared/types/form";
import {
  dateStringToLocalDate,
  formatDate,
  formatDateTime,
  localDateToDateString,
} from "@shared/utils";
import { getCookie, setCookie } from "@shared/utils/cookie";
import type { AxiosInstance } from "axios";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Download,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { DatePicker } from "./DatePicker";
import { DateTimePicker } from "./DateTimePicker";
import { Input } from "./Input";
import { Select } from "./Select";

interface Props<T> extends DataTableProps<T> {
  api: AxiosInstance;
}

const EMPTY_FILTERS: DataTableFilter[] = [];

function formatDateFilterValue(date: Date | null | undefined): string {
  return localDateToDateString(date) ?? "";
}

function parseDateFilterValue(value: DataTableFilterInputValue): Date | null {
  return typeof value === "string" ? dateStringToLocalDate(value) : null;
}

function parseDateTimeFilterValue(
  value: DataTableFilterInputValue,
): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveFilterBinding(field: DataTableFilterField): {
  field: string;
  op: DataTableFilter["op"];
  valueKind: DataTableFilterField["binding"]["value_kind"];
} {
  return {
    field: field.binding.field,
    op: field.binding.op,
    valueKind: field.binding.value_kind,
  };
}

function buildDefaultFilter(
  field: DataTableFilterField,
  value: DataTableFilterInputValue,
): DataTableFilter | null {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value) && value.length === 0) {
    return null;
  }

  const target = resolveFilterBinding(field);

  if (Array.isArray(value)) {
    return {
      field: target.field,
      op: target.valueKind === "values" ? target.op : "in",
      value: { values: value },
    };
  }

  switch (target.valueKind) {
    case "boolean":
      if (typeof value !== "boolean") {
        return null;
      }
      return { field: target.field, op: target.op, value: { bool: value } };
    case "values":
      if (!Array.isArray(value) || value.length === 0) {
        return null;
      }
      return { field: target.field, op: target.op, value: { values: value } };
    case "integer": {
      const parsed =
        typeof value === "number"
          ? value
          : Number.parseInt(String(value).trim(), 10);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      return {
        field: target.field,
        op: target.op,
        value: { number: parsed },
      };
    }
    case "decimal":
    case "date":
    case "date_time":
    case "text":
      return {
        field: target.field,
        op: target.op,
        value: { text: String(value) },
      };
  }
}

export function DataTable<T>({
  api,
  url,
  title,
  subtitle,
  columns,
  baseFilters = EMPTY_FILTERS,
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
    rows,
    meta,
    loading,
    error,
    page,
    perPage,
    sorts,
    filters,
    setPage,
    setPerPage,
    toggleSort,
    setFilters,
    refresh,
  } = useDataTable<T>({ api, url, baseFilters, defaultPerPage });

  useEffect(() => {
    if (refreshRef) refreshRef.current = refresh;
  }, [refresh, refreshRef]);

  // ── Auto-refresh ────────────────────────────────────────

  const interval = refreshInterval || 60;
  const cookieKey = `dt_autorefresh_${url}`;
  const [autoRefresh, setAutoRefresh] = useState(
    () => getCookie(cookieKey) === "1",
  );
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

  const [filterValues, setFilterValues] = useState<
    Record<string, DataTableFilterInputValue>
  >({});
  const filterValuesRef = useRef(filterValues);
  useEffect(() => {
    filterValuesRef.current = filterValues;
  }, [filterValues]);

  const filterFieldMap = useMemo<Map<string, DataTableFilterField>>(() => {
    const next = new Map<string, DataTableFilterField>();
    for (const row of meta?.filters ?? []) {
      for (const field of row.fields) {
        next.set(field.name, field);
      }
    }
    return next;
  }, [meta]);

  // ── Download ────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!downloadUrl) return;
    const params: Record<string, string> = {};
    const combinedFilters = [...baseFilters, ...filters];
    if (sorts.length > 0) {
      params.sort = JSON.stringify(serializeSorts(sorts));
    }
    if (combinedFilters.length > 0) {
      params.filters = JSON.stringify(combinedFilters);
    }
    const { data } = await api.get(downloadUrl, {
      params,
      responseType: "blob",
    });
    const blobUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "export.xlsx";
    a.click();
    URL.revokeObjectURL(blobUrl);
  }, [api, downloadUrl, sorts, filters, baseFilters]);

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
    const s = sorts.find((s) => s.field === field);
    return s ? s.direction : null;
  };

  // ── Footer detection ────────────────────────────────────

  const hasFooter = columns.some(
    (col) => col.footer || footerSums?.includes(String(col.key)),
  );

  // ── Render filters ─────────────────────────────────────

  const applyAllFilters = useCallback(() => {
    const active: DataTableFilter[] = [];
    for (const [name, value] of Object.entries(filterValuesRef.current)) {
      const field = filterFieldMap.get(name);
      if (!field) {
        continue;
      }

      const filter = buildDefaultFilter(field, value);
      if (filter) {
        active.push(filter);
      }
    }
    setFilters(active);
    setPage(1);
  }, [filterFieldMap, setFilters, setPage]);

  const resetFilters = useCallback(() => {
    setFilterValues({});
    setFilters([]);
    setPage(1);
  }, [setFilters, setPage]);

  const renderFilterField = (f: DataTableFilterField) => {
    const value = filterValues[f.name] ?? "";

    if (f.kind === "number") {
      return (
        <Input
          key={f.name}
          name={f.name}
          type="number"
          label={t(f.label)}
          value={
            typeof value === "string" || typeof value === "number"
              ? String(value)
              : ""
          }
          placeholder={f.placeholder ? t(f.placeholder) : ""}
          onChange={(v) =>
            setFilterValues((prev) => ({ ...prev, [f.name]: v }))
          }
        />
      );
    }

    if (f.kind === "select") {
      const options = f.options.items.map((opt) => ({
        value: opt.value,
        label: t(opt.label),
      }));
      const selectValue =
        typeof value === "string" || Array.isArray(value) ? value : undefined;
      return (
        <Select
          key={f.name}
          name={f.name}
          label={t(f.label)}
          value={selectValue}
          options={options}
          placeholder={t("All")}
          clearable
          onChange={(v) =>
            setFilterValues((prev) => ({ ...prev, [f.name]: v }))
          }
        />
      );
    }

    if (f.kind === "checkbox") {
      return (
        <Checkbox
          key={f.name}
          name={f.name}
          label={t(f.label)}
          checked={value === true}
          onChange={(v) =>
            setFilterValues((prev) => ({ ...prev, [f.name]: v }))
          }
        />
      );
    }

    if (f.kind === "date") {
      return (
        <DatePicker
          key={f.name}
          name={f.name}
          label={t(f.label)}
          value={parseDateFilterValue(value)}
          placeholder={f.placeholder ? t(f.placeholder) : ""}
          onChange={(date) =>
            setFilterValues((prev) => ({
              ...prev,
              [f.name]: formatDateFilterValue(date),
            }))
          }
        />
      );
    }

    if (f.kind === "date_time") {
      return (
        <DateTimePicker
          key={f.name}
          name={f.name}
          label={t(f.label)}
          value={parseDateTimeFilterValue(value)}
          placeholder={f.placeholder ? t(f.placeholder) : ""}
          onChange={(date) =>
            setFilterValues((prev) => ({
              ...prev,
              [f.name]: date ? date.toISOString() : "",
            }))
          }
        />
      );
    }

    return (
      <Input
        key={f.name}
        name={f.name}
        label={t(f.label)}
        value={typeof value === "string" ? value : ""}
        placeholder={f.placeholder ? t(f.placeholder) : ""}
        onChange={(v) => setFilterValues((prev) => ({ ...prev, [f.name]: v }))}
      />
    );
  };

  const getFilterRowKey = (row: DataTableFilterRow): string => {
    const fields = row.fields;
    return fields
      .map((field) => field.name || field.label || "field")
      .join("|");
  };

  const getRowKey = (row: T): string => {
    if (typeof row === "object" && row !== null) {
      const objectRow = row as Record<string, unknown>;
      const candidate = objectRow.id ?? objectRow.key ?? objectRow.uuid;
      if (candidate != null) {
        return String(candidate);
      }
      return JSON.stringify(objectRow);
    }

    return String(row);
  };

  const renderDefaultCell = (
    row: T,
    key: string,
    format?: "date" | "datetime",
  ): string => {
    const value = (row as Record<string, unknown>)[key];

    if (value == null) {
      return "";
    }

    if (format === "date") {
      return formatDate(
        typeof value === "string" || value instanceof Date ? value : null,
      );
    }

    if (format === "datetime") {
      return formatDateTime(
        typeof value === "string" ||
          typeof value === "number" ||
          value instanceof Date
          ? value
          : null,
      );
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }

    return JSON.stringify(value);
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
              {autoRefresh
                ? ` ${t("refresh_in", { seconds: countdown })}`
                : ` ${t("auto_refresh_every", { seconds: interval })}`}
            </label>
            {downloadUrl && (
              <button
                className="sf-datatable-download"
                onClick={handleDownload}
                type="button"
              >
                <Download size={16} />
              </button>
            )}
            <select
              className="sf-datatable-perpage"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
            >
              {[10, 20, 50, 100, 300, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n} / {t("page")}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Filters */}
      {meta && meta.filters.length > 0 && (
        <div className="sf-datatable-filters">
          {meta.filters.map((row) => (
            <div
              key={getFilterRowKey(row)}
              className={`sf-datatable-filter-row${row.fields.length === 1 ? " sf-datatable-filter-row--single" : ""}`}
            >
              {row.fields.map(renderFilterField)}
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
              {showIndex && (
                <th className="sf-datatable-th sf-datatable-th--index">#</th>
              )}
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
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <th
                    key={key}
                    className={thClasses}
                    onClick={
                      col.sortable
                        ? (e) => toggleSort(key, e.shiftKey)
                        : undefined
                    }
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
                <td
                  className="sf-datatable-empty"
                  colSpan={columns.length + (showIndex ? 1 : 0)}
                >
                  {t("No data")}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr className="sf-datatable-tr" key={getRowKey(row)}>
                  {showIndex && (
                    <td className="sf-datatable-td sf-datatable-td--index">
                      {(page - 1) * perPage + i + 1}
                    </td>
                  )}
                  {columns.map((col) => {
                    const key = String(col.key);
                    return (
                      <td
                        key={key}
                        className={`sf-datatable-td ${col.cellClassName ?? ""}`}
                      >
                        {col.render
                          ? col.render(row)
                          : renderDefaultCell(row, key, col.format)}
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
                      const val = Number((row as Record<string, unknown>)[key]);
                      return acc + (Number.isNaN(val) ? 0 : val);
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

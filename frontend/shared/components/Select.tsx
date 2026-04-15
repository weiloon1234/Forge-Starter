import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import type { SelectProps, SelectOption } from "@shared/types/form";
import { useDebounce } from "@shared/hooks/useDebounce";
import { FieldMessages, fieldClasses } from "./FieldMessages";

export function Select({
  name,
  value,
  onChange,
  options = [],
  placeholder,
  label,
  errors,
  hints,
  disabled,
  required,
  className,
  multiple,
  searchable,
  clearable,
  onSearch,
  loading,
}: SelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const hasErrors = !!(errors && errors.length > 0);

  const selectedValues = useMemo(() => {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const stableOnSearch = useCallback(
    (q: string) => { onSearch?.(q); },
    [onSearch]
  );
  const debouncedSearch = useDebounce(stableOnSearch, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (onSearch) {
      debouncedSearch(q);
    }
  };

  const filteredOptions = useMemo(() => {
    if (!query || onSearch) return options;
    const lower = query.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(lower));
  }, [options, query, onSearch]);

  const groupedOptions = useMemo(() => {
    const groups: { label: string | null; options: SelectOption[] }[] = [];
    const map = new Map<string | null, SelectOption[]>();

    for (const opt of filteredOptions) {
      const key = opt.group ?? null;
      if (!map.has(key)) {
        const arr: SelectOption[] = [];
        map.set(key, arr);
        groups.push({ label: key, options: arr });
      }
      map.get(key)!.push(opt);
    }

    return groups;
  }, [filteredOptions]);

  const positionDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < 200 && rect.top > spaceBelow;

    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      zIndex: 9999,
    });
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    if (!open) {
      positionDropdown();
    }
    setOpen(!open);
    setQuery("");
  };

  const handleClose = () => {
    setOpen(false);
    setQuery("");
  };

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", positionDropdown, true);
    window.addEventListener("resize", positionDropdown);
    return () => {
      window.removeEventListener("scroll", positionDropdown, true);
      window.removeEventListener("resize", positionDropdown);
    };
  }, [open, positionDropdown]);

  const handleSelect = (optValue: string) => {
    if (multiple) {
      const current = selectedValues;
      const next = current.includes(optValue)
        ? current.filter((v) => v !== optValue)
        : [...current, optValue];
      onChange?.(next);
    } else {
      onChange?.(optValue);
      handleClose();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(multiple ? [] : "");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleClose();
  };

  const displayLabel = useMemo(() => {
    if (selectedValues.length === 0) return null;
    const labels = selectedValues
      .map((v) => options.find((o) => o.value === v)?.label)
      .filter(Boolean);
    return labels.join(", ");
  }, [selectedValues, options]);

  const isEmpty = filteredOptions.length === 0 && !loading;

  const dropdown = open ? createPortal(
    <>
      <div className="sf-select-backdrop" onClick={handleClose} />
      <div className="sf-select-dropdown" ref={dropdownRef} style={dropdownStyle}>
        {searchable && (
          <input
            className="sf-select-search"
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder={t("form.search_placeholder")}
            ref={searchRef}
            autoFocus
          />
        )}

        {loading && <div className="sf-select-loading">{ t("Loading") }</div>}

        <div className="sf-select-options">
          {groupedOptions.map((group) => (
            <div key={group.label ?? "__ungrouped"}>
              {group.label && (
                <div className="sf-select-group-label">{group.label}</div>
              )}
              {group.options.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                const optClasses = [
                  "sf-select-option",
                  isSelected && "sf-select-option--selected",
                  opt.disabled && "sf-select-option--disabled",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={opt.value}
                    className={optClasses}
                    onClick={() => {
                      if (!opt.disabled) handleSelect(opt.value);
                    }}
                  >
                    {opt.label}
                    {isSelected && <span>&#10003;</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {isEmpty && (
          <div className="sf-select-empty">{ t("form.no_options") }</div>
        )}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className={fieldClasses({ hasErrors, disabled, className })} onKeyDown={handleKeyDown}>
      {label && (
        <label
          className={`sf-label${required ? " sf-label--required" : ""}`}
          htmlFor={name}
        >
          {label}
        </label>
      )}

      <button
        type="button"
        className="sf-select-trigger"
        onClick={handleToggle}
        disabled={disabled}
        id={name}
        ref={triggerRef}
      >
        <span className={displayLabel ? undefined : "sf-select-placeholder"}>
          {displayLabel || placeholder || t("form.select_placeholder")}
        </span>
        {clearable && displayLabel && (
          <span className="sf-select-clear" onClick={handleClear}>&#10005;</span>
        )}
        <span className="sf-select-arrow">&#9662;</span>
      </button>

      {dropdown}

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}

import { useState, useRef, useMemo } from "react";
import type { SelectProps, SelectOption } from "../types/form";
import { useDebounce } from "../hooks/useDebounce";

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
  onSearch,
  loading,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const hasErrors = errors && errors.length > 0;
  const fieldClasses = [
    "sf-field",
    hasErrors && "sf-field--error",
    disabled && "sf-field--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const selectedValues = useMemo(() => {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const debouncedSearch = useDebounce((q: string) => {
    onSearch?.(q);
  }, 300);

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

  const handleToggle = () => {
    if (disabled) return;
    setOpen(!open);
    setQuery("");
  };

  const handleClose = () => {
    setOpen(false);
    setQuery("");
  };

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

  const isEmpty =
    filteredOptions.length === 0 && !loading;

  return (
    <div className={fieldClasses} onKeyDown={handleKeyDown}>
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
      >
        <span className={displayLabel ? undefined : "sf-select-placeholder"}>
          {displayLabel || placeholder || "Select..."}
        </span>
        <span className="sf-select-arrow">&#9662;</span>
      </button>

      {open && (
        <>
          <div className="sf-select-backdrop" onClick={handleClose} />
          <div className="sf-select-dropdown">
            {searchable && (
              <input
                className="sf-select-search"
                type="text"
                value={query}
                onChange={handleSearchChange}
                placeholder="Search..."
                ref={searchRef}
                autoFocus
              />
            )}

            {loading && <div className="sf-select-loading">Loading...</div>}

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
              <div className="sf-select-empty">No options</div>
            )}
          </div>
        </>
      )}

      {hints && hints.length > 0 && (
        <div className="sf-hints">
          {hints.map((hint, i) => (
            <p key={i} className="sf-hint">
              {hint}
            </p>
          ))}
        </div>
      )}

      {hasErrors && (
        <div className="sf-errors">
          {errors.map((err, i) => (
            <p key={i} className="sf-error">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

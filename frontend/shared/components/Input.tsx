import type { InputProps } from "@shared/types/form";
import { useEffect, useRef } from "react";
import { FieldShell } from "./FieldShell";

const DEFAULT_COLOR_VALUE = "#334155";

// ── Money: digits + max one decimal point ───────────────
function sanitizeMoney(raw: string): string {
  let result = "";
  let hasDot = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      result += ch;
    } else if (ch === "." && !hasDot) {
      hasDot = true;
      result += ch;
    }
  }
  return result;
}

// ── ATM: keying 1234 displays as 12.34 ─────────────────
function formatAtm(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length === 1) return `0.0${digits}`;
  if (digits.length === 2) return `0.${digits}`;
  const integer = digits.slice(0, -2).replace(/^0+/, "") || "0";
  return `${integer}.${digits.slice(-2)}`;
}

function rawAtmDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

function normalizeColorForPicker(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    return `#${trimmed.slice(1, 7)}`.toLowerCase();
  }

  return DEFAULT_COLOR_VALUE;
}

export function Input({
  name,
  type = "text",
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onPrefocus,
  placeholder,
  label,
  errors,
  hints,
  disabled,
  readOnly,
  required,
  autoFocus,
  className,
  prefix,
  suffix,
  maxLength,
  rows,
  inputRef,
}: InputProps) {
  const hasErrors = !!(errors && errors.length > 0);
  const isMoney = type === "money";
  const isAtm = type === "atm";
  const isColor = type === "color";
  const isTextarea = type === "textarea";
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    if (isTextarea) {
      localTextareaRef.current?.focus();
      return;
    }
    localInputRef.current?.focus();
  }, [autoFocus, isTextarea]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    let val = e.target.value;

    if (isMoney) {
      val = sanitizeMoney(val);
    } else if (isAtm) {
      val = formatAtm(rawAtmDigits(val));
    }

    onChange?.(val);
  };

  const handleKeyDown = isAtm
    ? (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
          e.preventDefault();
          const trimmed = rawAtmDigits(value ?? "").slice(0, -1);
          onChange?.(formatAtm(trimmed));
          return;
        }
        // Block non-digit keys (allow ctrl/meta combos for copy/paste)
        if (
          e.key.length === 1 &&
          (e.key < "0" || e.key > "9") &&
          !e.ctrlKey &&
          !e.metaKey
        ) {
          e.preventDefault();
        }
      }
    : undefined;

  const handleMouseDown = () => {
    onPrefocus?.();
  };

  const nativeType = isMoney || isAtm ? "text" : type;
  const inputMode = isMoney || isAtm ? ("decimal" as const) : undefined;
  const colorPickerValue = normalizeColorForPicker(value);

  return (
    <FieldShell
      label={label}
      errors={errors}
      hints={hints}
      disabled={disabled}
      required={required}
      className={className}
      hasErrors={hasErrors}
      htmlFor={name}
    >
      {isTextarea ? (
        <textarea
          id={name}
          name={name}
          className="sf-textarea"
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          rows={rows ?? 4}
          ref={(node) => {
            localTextareaRef.current = node;
            if (inputRef) {
              inputRef.current = node;
            }
          }}
        />
      ) : isColor ? (
        <div className="sf-input-wrapper sf-color-input-wrapper">
          <input
            id={name}
            name={name}
            type="text"
            className="sf-input"
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            placeholder={placeholder ?? DEFAULT_COLOR_VALUE}
            disabled={disabled}
            readOnly={readOnly}
            maxLength={maxLength}
            ref={(node) => {
              localInputRef.current = node;
              if (inputRef) {
                inputRef.current = node;
              }
            }}
          />
          <label className="sf-color-swatch" aria-label={label ?? name}>
            <span
              className="sf-color-swatch-preview"
              style={{ backgroundColor: colorPickerValue }}
            />
            <input
              className="sf-color-native"
              type="color"
              value={colorPickerValue}
              disabled={disabled}
              onChange={(event) => onChange?.(event.target.value)}
              onBlur={onBlur}
              tabIndex={-1}
              aria-hidden="true"
            />
          </label>
        </div>
      ) : (
        <div className="sf-input-wrapper">
          {prefix && <span className="sf-input-prefix">{prefix}</span>}
          <input
            id={name}
            name={name}
            type={nativeType}
            inputMode={inputMode}
            className="sf-input"
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown ?? onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            placeholder={placeholder ?? (isAtm ? "0.00" : undefined)}
            disabled={disabled}
            readOnly={readOnly}
            maxLength={maxLength}
            ref={(node) => {
              localInputRef.current = node;
              if (inputRef) {
                inputRef.current = node;
              }
            }}
          />
          {suffix && <span className="sf-input-suffix">{suffix}</span>}
        </div>
      )}
    </FieldShell>
  );
}

import type { InputProps } from "@shared/types/form";
import { FieldMessages, fieldClasses } from "./FieldMessages";

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
  if (digits.length === 1) return "0.0" + digits;
  if (digits.length === 2) return "0." + digits;
  const integer = digits.slice(0, -2).replace(/^0+/, "") || "0";
  return integer + "." + digits.slice(-2);
}

function rawAtmDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
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
  const isTextarea = type === "textarea";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
        if (e.key.length === 1 && (e.key < "0" || e.key > "9") && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
        }
      }
    : undefined;

  const handleMouseDown = () => {
    onPrefocus?.();
  };

  const nativeType = isMoney || isAtm ? "text" : type;
  const inputMode = isMoney || isAtm ? ("decimal" as const) : undefined;

  return (
    <div className={fieldClasses({ hasErrors, disabled, className })}>
      {label && (
        <label
          className={`sf-label${required ? " sf-label--required" : ""}`}
          htmlFor={name}
        >
          {label}
        </label>
      )}

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
          autoFocus={autoFocus}
          maxLength={maxLength}
          rows={rows ?? 4}
          ref={inputRef as React.RefObject<HTMLTextAreaElement | null>}
        />
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
            autoFocus={autoFocus}
            maxLength={maxLength}
            ref={inputRef as React.RefObject<HTMLInputElement | null>}
          />
          {suffix && <span className="sf-input-suffix">{suffix}</span>}
        </div>
      )}

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}

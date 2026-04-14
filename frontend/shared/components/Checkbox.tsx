import type { CheckboxProps } from "../types/form";

export function Checkbox({
  name,
  checked,
  onChange,
  label,
  children,
  errors,
  hints,
  disabled,
  className,
}: CheckboxProps) {
  const hasErrors = errors && errors.length > 0;
  const fieldClasses = [
    "sf-field",
    hasErrors && "sf-field--error",
    disabled && "sf-field--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={fieldClasses}>
      <label className="sf-checkbox">
        <input
          type="checkbox"
          className="sf-checkbox-input"
          name={name}
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
        />
        <span className="sf-checkbox-label">{children || label}</span>
      </label>

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

import type { RadioProps } from "../types/form";

export function Radio({
  name,
  value,
  onChange,
  options,
  label,
  errors,
  hints,
  disabled,
  required,
  className,
}: RadioProps) {
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
      {label && (
        <label className={`sf-label${required ? " sf-label--required" : ""}`}>
          {label}
        </label>
      )}

      <div className="sf-radio-group">
        {options.map((opt) => (
          <label key={opt.value} className="sf-radio">
            <input
              type="radio"
              className="sf-radio-input"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange?.(opt.value)}
              disabled={disabled || opt.disabled}
            />
            <span className="sf-radio-label">{opt.label}</span>
          </label>
        ))}
      </div>

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

import type { CheckboxGroupProps } from "../types/form";

export function CheckboxGroup({
  name,
  value = [],
  onChange,
  options,
  label,
  errors,
  hints,
  disabled,
  required,
  className,
}: CheckboxGroupProps) {
  const hasErrors = errors && errors.length > 0;
  const fieldClasses = [
    "sf-field",
    hasErrors && "sf-field--error",
    disabled && "sf-field--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleToggle = (optValue: string) => {
    const next = value.includes(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue];
    onChange?.(next);
  };

  return (
    <div className={fieldClasses}>
      {label && (
        <label className={`sf-label${required ? " sf-label--required" : ""}`}>
          {label}
        </label>
      )}

      {options.map((opt) => (
        <label key={opt.value} className="sf-checkbox">
          <input
            type="checkbox"
            className="sf-checkbox-input"
            name={name}
            checked={value.includes(opt.value)}
            onChange={() => handleToggle(opt.value)}
            disabled={disabled || opt.disabled}
          />
          <span className="sf-checkbox-label">{opt.label}</span>
        </label>
      ))}

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

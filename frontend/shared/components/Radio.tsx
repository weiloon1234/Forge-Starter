import type { RadioProps } from "@shared/types/form";
import { FieldMessages, fieldClasses } from "./FieldMessages";

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
  const hasErrors = !!(errors && errors.length > 0);

  return (
    <div className={fieldClasses({ hasErrors, disabled, className })}>
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

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}

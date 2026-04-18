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
  orientation = "vertical",
  align = "start",
}: RadioProps) {
  const hasErrors = !!(errors && errors.length > 0);
  const groupClassName = [
    "sf-radio-group",
    `sf-radio-group--${orientation}`,
    `sf-radio-group--align-${align}`,
  ].join(" ");

  return (
    <div className={fieldClasses({ hasErrors, disabled, className })}>
      {label && (
        <div className={`sf-label${required ? " sf-label--required" : ""}`}>
          {label}
        </div>
      )}

      <div className={groupClassName}>
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

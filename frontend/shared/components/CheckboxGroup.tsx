import type { CheckboxGroupProps } from "@shared/types/form";
import { FieldShell } from "./FieldShell";

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
  const hasErrors = !!(errors && errors.length > 0);

  const handleToggle = (optValue: string) => {
    const next = value.includes(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue];
    onChange?.(next);
  };

  return (
    <FieldShell
      label={label}
      errors={errors}
      hints={hints}
      disabled={disabled}
      required={required}
      className={className}
      hasErrors={hasErrors}
      labelElement="div"
    >
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
    </FieldShell>
  );
}

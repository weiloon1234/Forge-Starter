import type { CheckboxProps } from "@shared/types/form";
import { FieldShell } from "./FieldShell";

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
  const hasErrors = !!(errors && errors.length > 0);

  return (
    <FieldShell
      errors={errors}
      hints={hints}
      disabled={disabled}
      className={className}
      hasErrors={hasErrors}
    >
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
    </FieldShell>
  );
}

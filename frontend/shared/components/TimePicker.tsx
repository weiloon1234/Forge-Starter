import type { TimePickerProps } from "@shared/types/form";
import { Clock } from "lucide-react";
import { useMemo } from "react";
import { FieldShell } from "./FieldShell";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function TimePicker({
  name,
  value = "",
  onChange,
  label,
  placeholder: _placeholder = "Select time",
  errors,
  hints,
  disabled,
  required,
  className,
  minuteStep = 5,
}: TimePickerProps) {
  const hasErrors = errors && errors.length > 0;
  const [hour, minute] = value ? value.split(":").map(Number) : [-1, -1];

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(60 / minuteStep) },
        (_, i) => i * minuteStep,
      ),
    [minuteStep],
  );

  const handleChange = (h: number, m: number) => {
    if (h >= 0 && m >= 0) {
      onChange?.(`${pad(h)}:${pad(m)}`);
    }
  };

  return (
    <FieldShell
      label={label}
      errors={errors}
      hints={hints}
      disabled={disabled}
      required={required}
      className={className}
      hasErrors={Boolean(hasErrors)}
      htmlFor={name}
    >
      <div className="sf-timepicker">
        <Clock size={16} className="sf-timepicker-icon" />
        <select
          className="sf-timepicker-select"
          value={hour >= 0 ? hour : ""}
          onChange={(e) =>
            handleChange(Number(e.target.value), minute >= 0 ? minute : 0)
          }
          disabled={disabled}
          aria-label="Hour"
        >
          <option value="" disabled>
            HH
          </option>
          {hours.map((h) => (
            <option key={h} value={h}>
              {pad(h)}
            </option>
          ))}
        </select>
        <span className="sf-timepicker-separator">:</span>
        <select
          className="sf-timepicker-select"
          value={minute >= 0 ? minute : ""}
          onChange={(e) =>
            handleChange(hour >= 0 ? hour : 0, Number(e.target.value))
          }
          disabled={disabled}
          aria-label="Minute"
        >
          <option value="" disabled>
            MM
          </option>
          {minutes.map((m) => (
            <option key={m} value={m}>
              {pad(m)}
            </option>
          ))}
        </select>
      </div>
    </FieldShell>
  );
}

import { useMemo } from "react";
import { Clock } from "lucide-react";
import type { TimePickerProps } from "../types/form";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function TimePicker({
  name,
  value = "",
  onChange,
  label,
  placeholder = "Select time",
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
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
    [minuteStep]
  );

  const handleChange = (h: number, m: number) => {
    if (h >= 0 && m >= 0) {
      onChange?.(`${pad(h)}:${pad(m)}`);
    }
  };

  const fieldClasses = [
    "sf-field",
    hasErrors && "sf-field--error",
    disabled && "sf-field--disabled",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className={fieldClasses}>
      {label && (
        <label className={`sf-label${required ? " sf-label--required" : ""}`} htmlFor={name}>
          {label}
        </label>
      )}

      <div className="sf-timepicker">
        <Clock size={16} className="sf-timepicker-icon" />
        <select
          className="sf-timepicker-select"
          value={hour >= 0 ? hour : ""}
          onChange={(e) => handleChange(Number(e.target.value), minute >= 0 ? minute : 0)}
          disabled={disabled}
          aria-label="Hour"
        >
          <option value="" disabled>HH</option>
          {hours.map((h) => (
            <option key={h} value={h}>{pad(h)}</option>
          ))}
        </select>
        <span className="sf-timepicker-separator">:</span>
        <select
          className="sf-timepicker-select"
          value={minute >= 0 ? minute : ""}
          onChange={(e) => handleChange(hour >= 0 ? hour : 0, Number(e.target.value))}
          disabled={disabled}
          aria-label="Minute"
        >
          <option value="" disabled>MM</option>
          {minutes.map((m) => (
            <option key={m} value={m}>{pad(m)}</option>
          ))}
        </select>
      </div>

      {hints && hints.length > 0 && (
        <div className="sf-hints">
          {hints.map((hint, i) => <p key={i} className="sf-hint">{hint}</p>)}
        </div>
      )}
      {hasErrors && (
        <div className="sf-errors">
          {errors.map((err, i) => <p key={i} className="sf-error">{err}</p>)}
        </div>
      )}
    </div>
  );
}

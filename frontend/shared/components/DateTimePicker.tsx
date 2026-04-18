import type { DateTimePickerProps } from "@shared/types/form";
import { useTranslation } from "react-i18next";
import { DatePicker } from "./DatePicker";
import { FieldMessages } from "./FieldMessages";
import { TimePicker } from "./TimePicker";

function getTimeString(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function combineDateAndTime(date: Date | null, time: string): Date | null {
  if (!date) return null;
  const result = new Date(date);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    result.setHours(h, m, 0, 0);
  }
  return result;
}

export function DateTimePicker({
  name,
  value,
  onChange,
  label,
  placeholder,
  errors,
  hints,
  disabled,
  required,
  className,
  minDate,
  maxDate,
  minuteStep = 5,
}: DateTimePickerProps) {
  const { t } = useTranslation();
  const hasErrors = errors && errors.length > 0;

  const fieldClasses = [
    "sf-field",
    hasErrors && "sf-field--error",
    disabled && "sf-field--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleDateChange = (date: Date | null) => {
    const time = getTimeString(value);
    onChange?.(combineDateAndTime(date, time));
  };

  const handleTimeChange = (time: string) => {
    const date = value ?? new Date();
    onChange?.(combineDateAndTime(date, time));
  };

  return (
    <div className={fieldClasses}>
      {label && (
        <div className={`sf-label${required ? " sf-label--required" : ""}`}>
          {label}
        </div>
      )}

      <div className="sf-datetime">
        <DatePicker
          name={`${name}_date`}
          value={value}
          onChange={handleDateChange}
          placeholder={placeholder ?? t("form.date")}
          disabled={disabled}
          minDate={minDate}
          maxDate={maxDate}
        />
        <TimePicker
          name={`${name}_time`}
          value={getTimeString(value)}
          onChange={handleTimeChange}
          placeholder={t("form.time")}
          disabled={disabled}
          minuteStep={minuteStep}
        />
      </div>

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}

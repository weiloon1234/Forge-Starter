import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { DatePickerProps } from "@shared/types/form";
import { FieldMessages, fieldClasses } from "./FieldMessages";

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

export function DatePicker({
  name,
  value,
  onChange,
  label,
  placeholder = "Select date",
  errors,
  hints,
  disabled,
  required,
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasErrors = errors && errors.length > 0;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const classes = fieldClasses({ hasErrors: !!hasErrors, disabled, className });

  return (
    <div className={classes} ref={containerRef}>
      {label && (
        <label className={`sf-label${required ? " sf-label--required" : ""}`} htmlFor={name}>
          {label}
        </label>
      )}

      <button
        type="button"
        id={name}
        className="sf-datepicker-trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className={value ? "" : "sf-datepicker-placeholder"}>
          {value ? formatDate(value) : placeholder}
        </span>
        <CalendarDays size={16} className="sf-datepicker-icon" />
      </button>

      {open && (
        <div className="sf-datepicker-dropdown">
          <DayPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={(date) => {
              onChange?.(date ?? null);
              setOpen(false);
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            classNames={{
              root: "sf-calendar",
              months: "sf-calendar-months",
              month: "sf-calendar-month",
              month_caption: "sf-calendar-caption",
              caption_label: "sf-calendar-caption-label",
              nav: "sf-calendar-nav",
              button_previous: "sf-calendar-nav-btn",
              button_next: "sf-calendar-nav-btn",
              month_grid: "sf-calendar-grid",
              weekdays: "sf-calendar-weekdays",
              weekday: "sf-calendar-weekday",
              week: "sf-calendar-week",
              day: "sf-calendar-day",
              day_button: "sf-calendar-day-btn",
              selected: "sf-calendar-day--selected",
              today: "sf-calendar-day--today",
              outside: "sf-calendar-day--outside",
              disabled: "sf-calendar-day--disabled",
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />,
            }}
          />
        </div>
      )}

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}

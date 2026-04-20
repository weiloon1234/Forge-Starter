import type { DatePickerProps } from "@shared/types/form";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { createPortal } from "react-dom";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const hasErrors = errors && errors.length > 0;

  const positionDropdown = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownWidth = dropdownRef.current?.offsetWidth ?? 320;
    const dropdownHeight = dropdownRef.current?.offsetHeight ?? 340;
    const offset = 4;
    const viewportPadding = 8;
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - dropdownWidth - viewportPadding,
    );
    const left = Math.min(Math.max(rect.left, viewportPadding), maxLeft);
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < dropdownHeight && rect.top > spaceBelow;

    setDropdownStyle({
      position: "fixed",
      left,
      minWidth: rect.width,
      zIndex: 9999,
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + offset }
        : { top: rect.bottom + offset }),
    });
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;

      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    positionDropdown();
    const frame = window.requestAnimationFrame(positionDropdown);
    window.addEventListener("scroll", positionDropdown, true);
    window.addEventListener("resize", positionDropdown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", positionDropdown, true);
      window.removeEventListener("resize", positionDropdown);
    };
  }, [open, positionDropdown]);

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
  const dropdown = open
    ? createPortal(
        <div
          className="sf-datepicker-dropdown"
          ref={dropdownRef}
          style={dropdownStyle}
        >
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
                orientation === "left" ? (
                  <ChevronLeft size={16} />
                ) : (
                  <ChevronRight size={16} />
                ),
            }}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={classes} ref={containerRef}>
      {label && (
        <label
          className={`sf-label${required ? " sf-label--required" : ""}`}
          htmlFor={name}
        >
          {label}
        </label>
      )}

      <button
        type="button"
        id={name}
        className="sf-datepicker-trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        ref={triggerRef}
      >
        <span className={value ? "" : "sf-datepicker-placeholder"}>
          {value ? formatDate(value) : placeholder}
        </span>
        <CalendarDays size={16} className="sf-datepicker-icon" />
      </button>

      {dropdown}

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}

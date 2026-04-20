export interface FormatDateTimeOptions {
  includeSeconds?: boolean;
}

type DateValue = string | number | Date | null | undefined;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isDateOnlyString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function getBrowserTimezone(): string | null {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === "string" && timezone.trim() !== ""
      ? timezone
      : null;
  } catch {
    return null;
  }
}

export function dateStringToLocalDate(
  value: string | null | undefined,
): Date | null {
  if (!value || !isDateOnlyString(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function localDateToDateString(
  value: Date | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function parseDateTimeValue(value: DateValue): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const parsed = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (value.startsWith("timestamptz:")) {
    const parsed = new Date(value.slice("timestamptz:".length));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateTimeStringToDate(
  value: string | null | undefined,
): Date | null {
  return typeof value === "string" ? parseDateTimeValue(value) : null;
}

export function dateToIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (value == null) {
    return "—";
  }

  const date =
    typeof value === "string"
      ? dateStringToLocalDate(value)
      : parseDateTimeValue(value);

  if (!date) {
    return typeof value === "string" && value ? value : "—";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatDateTime(
  value: DateValue,
  options: FormatDateTimeOptions = {},
): string {
  const date = parseDateTimeValue(value);
  if (!date) {
    return typeof value === "string" && value ? value : "—";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(options.includeSeconds ? { second: "2-digit" } : {}),
  });
}

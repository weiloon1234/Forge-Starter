import type { SelectOption } from "@shared/types/form";
import type {
  AdminSettingAssetResponse,
  AdminSettingResponse,
  SettingType,
} from "@shared/types/generated";
import { SettingTypeOptions } from "@shared/types/generated";
import {
  dateStringToLocalDate,
  dateTimeStringToDate,
  dateToIsoString,
  enumLabel,
  localDateToDateString,
} from "@shared/utils";
import type { TFunction } from "i18next";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringParameter(
  parameters: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = parameters[key];
  return typeof value === "string" ? value : undefined;
}

function numberParameter(
  parameters: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArrayParameter(
  parameters: Record<string, unknown>,
  key: string,
): string[] {
  const value = parameters[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function settingParameters(
  parameters: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  return isRecord(parameters) ? parameters : {};
}

export function settingTypeLabel(type: SettingType, t: TFunction): string {
  return enumLabel(SettingTypeOptions, type, t);
}

export function settingOptions(
  parameters: Record<string, unknown> | undefined | null,
): SelectOption[] {
  const record = settingParameters(parameters);
  const options = record.options;

  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      if (!isRecord(option)) {
        return null;
      }

      const value = option.value;
      const label = option.label;
      if (typeof value !== "string" || typeof label !== "string") {
        return null;
      }

      return { value, label };
    })
    .filter((option): option is SelectOption => option !== null);
}

export function settingAccept(
  parameters: Record<string, unknown> | undefined | null,
): string | undefined {
  const values = stringArrayParameter(
    settingParameters(parameters),
    "allowed_mimes",
  );
  return values.length > 0 ? values.join(",") : undefined;
}

export function settingMaxSizeBytes(
  parameters: Record<string, unknown> | undefined | null,
): number | undefined {
  const maxSizeKb = numberParameter(
    settingParameters(parameters),
    "max_size_kb",
  );
  return typeof maxSizeKb === "number" ? maxSizeKb * 1024 : undefined;
}

export function settingMaxLength(
  parameters: Record<string, unknown> | undefined | null,
): number | undefined {
  return numberParameter(settingParameters(parameters), "max_length");
}

export function settingPlaceholder(
  parameters: Record<string, unknown> | undefined | null,
): string | undefined {
  return stringParameter(settingParameters(parameters), "placeholder");
}

export function settingRows(
  parameters: Record<string, unknown> | undefined | null,
  fallback = 4,
): number {
  return numberParameter(settingParameters(parameters), "rows") ?? fallback;
}

export function settingLanguage(
  parameters: Record<string, unknown> | undefined | null,
): string | undefined {
  return stringParameter(settingParameters(parameters), "language");
}

export function isSettingAssetValue(
  value: unknown,
): value is AdminSettingAssetResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.disk === "string" &&
    typeof value.path === "string" &&
    typeof value.name === "string"
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function summarizeSettingValue(
  type: SettingType,
  value: unknown,
  t: TFunction,
): string {
  if (value == null) {
    return "—";
  }

  switch (type) {
    case "boolean":
      return value === true ? t("Enabled") : t("Disabled");
    case "multiselect":
      return Array.isArray(value)
        ? truncate(
            value
              .filter((item): item is string => typeof item === "string")
              .join(", "),
          )
        : "—";
    case "file":
    case "image":
      return isSettingAssetValue(value) ? value.name : "—";
    case "json":
      return truncate(compactJson(value));
    default:
      if (typeof value === "string") {
        return truncate(value);
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return truncate(compactJson(value));
  }
}

export function editableSettingValue(setting: AdminSettingResponse): unknown {
  const { setting_type, value } = setting;

  switch (setting_type) {
    case "number":
      return typeof value === "number" || typeof value === "string"
        ? String(value)
        : "";
    case "boolean":
      return value === true;
    case "multiselect":
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    case "json":
      return value == null ? "" : JSON.stringify(value, null, 2);
    case "color":
      return typeof value === "string" && value !== "" ? value : "#334155";
    case "file":
    case "image":
      return null;
    default:
      return typeof value === "string" ? value : "";
  }
}

export function serializeSettingValue(
  settingType: SettingType,
  editableValue: unknown,
): unknown {
  switch (settingType) {
    case "number": {
      const raw = typeof editableValue === "string" ? editableValue.trim() : "";
      if (raw === "") {
        return null;
      }

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new RangeError("invalid_number");
      }

      return parsed;
    }
    case "boolean":
      return editableValue === true;
    case "select":
    case "date":
    case "datetime": {
      const raw = typeof editableValue === "string" ? editableValue.trim() : "";
      return raw === "" ? null : raw;
    }
    case "multiselect":
      return Array.isArray(editableValue)
        ? editableValue.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
    case "json": {
      const raw = typeof editableValue === "string" ? editableValue.trim() : "";
      if (raw === "") {
        return null;
      }

      return JSON.parse(raw) as unknown;
    }
    case "file":
    case "image":
      return null;
    default:
      return typeof editableValue === "string" ? editableValue : "";
  }
}

export {
  dateStringToLocalDate,
  dateTimeStringToDate,
  dateToIsoString,
  localDateToDateString,
};

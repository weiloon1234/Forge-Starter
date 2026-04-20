// Auto-generated from AppEnum. Do not edit.

export type CountryStatus = "enabled" | "disabled";

export const CountryStatusValues = [
  "enabled",
  "disabled",
] as const;

export const CountryStatusOptions = [
  { value: "enabled", labelKey: "enum.country_status.enabled" },
  { value: "disabled", labelKey: "enum.country_status.disabled" },
] as const;

export const CountryStatusMeta = {
id: "country_status",
keyKind: "string",
options: CountryStatusOptions,
} as const;

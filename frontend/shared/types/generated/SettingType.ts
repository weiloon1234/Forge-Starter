// Auto-generated from AppEnum. Do not edit.

export type SettingType = "text" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "email" | "url" | "color" | "date" | "datetime" | "file" | "image" | "json" | "password" | "code";

export const SettingTypeValues = [
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multiselect",
  "email",
  "url",
  "color",
  "date",
  "datetime",
  "file",
  "image",
  "json",
  "password",
  "code",
] as const;

export const SettingTypeOptions = [
  { value: "text", labelKey: "enum.setting_type.text" },
  { value: "textarea", labelKey: "enum.setting_type.textarea" },
  { value: "number", labelKey: "enum.setting_type.number" },
  { value: "boolean", labelKey: "enum.setting_type.boolean" },
  { value: "select", labelKey: "enum.setting_type.select" },
  { value: "multiselect", labelKey: "enum.setting_type.multiselect" },
  { value: "email", labelKey: "enum.setting_type.email" },
  { value: "url", labelKey: "enum.setting_type.url" },
  { value: "color", labelKey: "enum.setting_type.color" },
  { value: "date", labelKey: "enum.setting_type.date" },
  { value: "datetime", labelKey: "enum.setting_type.datetime" },
  { value: "file", labelKey: "enum.setting_type.file" },
  { value: "image", labelKey: "enum.setting_type.image" },
  { value: "json", labelKey: "enum.setting_type.json" },
  { value: "password", labelKey: "enum.setting_type.password" },
  { value: "code", labelKey: "enum.setting_type.code" },
] as const;

export const SettingTypeMeta = {
id: "setting_type",
keyKind: "string",
options: SettingTypeOptions,
} as const;

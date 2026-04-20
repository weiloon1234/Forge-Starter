// Auto-generated from AppEnum. Do not edit.

export type Permission = "exports.read" | "observability.view" | "admins.read" | "admins.manage" | "users.read" | "users.manage" | "countries.read" | "countries.manage" | "settings.read" | "settings.manage" | "pages.read" | "pages.manage" | "credits.read" | "credits.manage" | "credit_transactions.read" | "logs.read" | "logs.manage";

export const PermissionValues = [
  "exports.read",
  "observability.view",
  "admins.read",
  "admins.manage",
  "users.read",
  "users.manage",
  "countries.read",
  "countries.manage",
  "settings.read",
  "settings.manage",
  "pages.read",
  "pages.manage",
  "credits.read",
  "credits.manage",
  "credit_transactions.read",
  "logs.read",
  "logs.manage",
] as const;

export const PermissionOptions = [
  { value: "exports.read", labelKey: "enum.permission.exports_read" },
  { value: "observability.view", labelKey: "enum.permission.observability_view" },
  { value: "admins.read", labelKey: "enum.permission.admins_read" },
  { value: "admins.manage", labelKey: "enum.permission.admins_manage" },
  { value: "users.read", labelKey: "enum.permission.users_read" },
  { value: "users.manage", labelKey: "enum.permission.users_manage" },
  { value: "countries.read", labelKey: "enum.permission.countries_read" },
  { value: "countries.manage", labelKey: "enum.permission.countries_manage" },
  { value: "settings.read", labelKey: "enum.permission.settings_read" },
  { value: "settings.manage", labelKey: "enum.permission.settings_manage" },
  { value: "pages.read", labelKey: "enum.permission.pages_read" },
  { value: "pages.manage", labelKey: "enum.permission.pages_manage" },
  { value: "credits.read", labelKey: "enum.permission.credits_read" },
  { value: "credits.manage", labelKey: "enum.permission.credits_manage" },
  { value: "credit_transactions.read", labelKey: "enum.permission.credit_transactions_read" },
  { value: "logs.read", labelKey: "enum.permission.logs_read" },
  { value: "logs.manage", labelKey: "enum.permission.logs_manage" },
] as const;

export const PermissionMeta = {
id: "permission",
keyKind: "string",
options: PermissionOptions,
} as const;

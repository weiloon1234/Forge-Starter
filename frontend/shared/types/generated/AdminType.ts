// Auto-generated from AppEnum. Do not edit.

export type AdminType = "super_admin" | "developer" | "admin";

export const AdminTypeValues = [
  "super_admin",
  "developer",
  "admin",
] as const;

export const AdminTypeOptions = [
  { value: "super_admin", labelKey: "enum.admin_type.super_admin" },
  { value: "developer", labelKey: "enum.admin_type.developer" },
  { value: "admin", labelKey: "enum.admin_type.admin" },
] as const;

export const AdminTypeMeta = {
id: "admin_type",
keyKind: "string",
options: AdminTypeOptions,
} as const;

import type {
  AdminResponse,
  AdminType,
  CreateAdminRequest,
  Permission,
  UpdateAdminRequest,
} from "@shared/types/generated";

export interface AdminFormValues extends Record<string, unknown> {
  username: string;
  email: string;
  name: string;
  password: string;
  admin_type: AdminType;
  permissions: Permission[];
  locale: string;
}

export function emptyAdminFormValues(locale: string): AdminFormValues {
  return {
    username: "",
    email: "",
    name: "",
    password: "",
    admin_type: "admin",
    permissions: [],
    locale,
  };
}

export function adminFormValuesFromResponse(
  admin: AdminResponse,
): AdminFormValues {
  return {
    username: admin.username,
    email: admin.email,
    name: admin.name,
    password: "",
    admin_type: admin.admin_type,
    permissions: admin.permissions,
    locale: admin.locale,
  };
}

export function buildCreateAdminPayload(
  values: AdminFormValues,
): CreateAdminRequest {
  return {
    username: values.username,
    email: values.email,
    name: values.name,
    password: values.password,
    admin_type: values.admin_type,
    permissions: resolvedPermissions(values),
    locale: values.locale,
  };
}

export function buildUpdateAdminPayload(
  values: AdminFormValues,
): UpdateAdminRequest {
  return {
    name: values.name,
    email: values.email,
    permissions: resolvedPermissions(values),
    admin_type: values.admin_type,
    locale: null,
    password: values.password || null,
  };
}

function resolvedPermissions(
  values: Pick<AdminFormValues, "admin_type" | "permissions">,
): Permission[] {
  return values.admin_type === "admin" ? values.permissions : [];
}

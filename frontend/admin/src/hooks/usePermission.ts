import type { AdminType, Permission } from "@shared/types/generated";
import { auth } from "@/auth";

function isBypassAdminType(adminType: AdminType | undefined): boolean {
  return adminType === "developer" || adminType === "super_admin";
}

export function hasPermission(
  abilities: Permission[] | undefined,
  required: Permission,
  adminType?: AdminType,
): boolean {
  if (isBypassAdminType(adminType)) {
    return true;
  }

  return abilities?.includes(required) ?? false;
}

export function hasAllPermissions(
  abilities: Permission[] | undefined,
  required: Permission[],
  adminType?: AdminType,
): boolean {
  if (isBypassAdminType(adminType)) {
    return true;
  }

  return required.every((permission) =>
    hasPermission(abilities, permission, adminType),
  );
}

export function usePermission(required: Permission): boolean {
  const { user } = auth.useAuth();
  return hasPermission(user?.abilities, required, user?.admin_type);
}

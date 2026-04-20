import type { AdminType } from "@shared/types/generated";

interface AdminActorLike {
  id?: string;
  admin_type?: AdminType;
}

interface AdminTargetLike {
  id: string;
  admin_type: AdminType;
}

export type AdminFormMode = "edit" | "view";

export const DEVELOPER_ADMIN_TYPE: AdminType = "developer";
export const DEVELOPER_ONLY_ADMIN_TYPES = [
  DEVELOPER_ADMIN_TYPE,
] as const satisfies readonly AdminType[];

export function hasAdminTypeAccess(
  adminType: AdminType | null | undefined,
  allowedAdminTypes?: readonly AdminType[],
): boolean {
  if (!allowedAdminTypes || allowedAdminTypes.length === 0) {
    return true;
  }

  if (!adminType) {
    return false;
  }

  return allowedAdminTypes.includes(adminType);
}

export function isDeveloperAdminType(
  adminType: AdminType | null | undefined,
): adminType is typeof DEVELOPER_ADMIN_TYPE {
  return adminType === DEVELOPER_ADMIN_TYPE;
}

export function canAccessObservability(
  actor: AdminActorLike | null | undefined,
): boolean {
  return isDeveloperAdminType(actor?.admin_type);
}

export function canViewAdminTarget(
  actor: AdminActorLike | null | undefined,
  target: AdminTargetLike,
): boolean {
  if (!actor?.admin_type) {
    return false;
  }

  switch (actor.admin_type) {
    case "developer":
      return (
        target.admin_type === "super_admin" || target.admin_type === "admin"
      );
    case "super_admin":
    case "admin":
      return target.admin_type === "admin";
    default:
      return false;
  }
}

export function canManageAdminTarget(
  actor: AdminActorLike | null | undefined,
  target: AdminTargetLike,
): boolean {
  if (!actor?.admin_type || !actor.id || actor.id === target.id) {
    return false;
  }

  switch (actor.admin_type) {
    case "developer":
      return (
        target.admin_type === "super_admin" || target.admin_type === "admin"
      );
    case "super_admin":
    case "admin":
      return target.admin_type === "admin";
    default:
      return false;
  }
}

export function canDeleteAdminTarget(
  actor: AdminActorLike | null | undefined,
  target: AdminTargetLike,
): boolean {
  return canManageAdminTarget(actor, target);
}

export function adminFormModeForTarget(
  actor: AdminActorLike | null | undefined,
  target: AdminTargetLike,
): AdminFormMode {
  return canManageAdminTarget(actor, target) ? "edit" : "view";
}

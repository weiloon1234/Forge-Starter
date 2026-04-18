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

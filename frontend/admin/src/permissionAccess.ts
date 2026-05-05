import type { AdminType, Permission } from "@shared/types/generated";
import { PermissionGroups, PermissionValues } from "@shared/types/generated";

export type PermissionAction = "read" | "manage";
export type PermissionSelection = "none" | PermissionAction;

export interface PermissionModule {
  key: string;
  read?: Permission;
  manage?: Permission;
}

type PermissionGroup = (typeof PermissionGroups)[keyof typeof PermissionGroups];

const MODULES = buildModules(PermissionGroups);

function groupPermission(
  group: PermissionGroup,
  action: PermissionAction,
): Permission | undefined {
  if (!(action in group)) {
    return undefined;
  }

  return group[action as keyof typeof group] as Permission;
}

function moduleKey(read?: Permission, manage?: Permission): string | undefined {
  return (read ?? manage)?.split(".")[0];
}

function buildModules(groups: typeof PermissionGroups): PermissionModule[] {
  return Object.values(groups).flatMap((group) => {
    const read = groupPermission(group, "read");
    const manage = groupPermission(group, "manage");
    const key = moduleKey(read, manage);

    if (!key || (!read && !manage)) {
      return [];
    }

    return [{ key, read, manage }];
  });
}

function effectivePermissionValues(
  adminType: AdminType,
  permissions: Permission[],
): Permission[] {
  if (adminType === "developer" || adminType === "super_admin") {
    return [...PermissionValues];
  }

  return permissions;
}

export function permissionModules(): PermissionModule[] {
  return MODULES;
}

export function selectedPermissionAction(
  module: PermissionModule,
  permissions: Permission[],
): PermissionSelection {
  if (module.manage && permissions.includes(module.manage)) {
    return "manage";
  }
  if (module.read && permissions.includes(module.read)) {
    return "read";
  }
  return "none";
}

export function nextModulePermissions(
  current: Permission[],
  module: PermissionModule,
  action: PermissionSelection,
): Permission[] {
  const filtered = current.filter(
    (permission) => permission !== module.read && permission !== module.manage,
  );

  if (action === "none") {
    return filtered;
  }

  const nextPermission = action === "manage" ? module.manage : module.read;
  return nextPermission ? [...filtered, nextPermission] : filtered;
}

export function permissionSummary(
  adminType: AdminType,
  permissions: Permission[],
): Array<{ module: PermissionModule; selection: PermissionSelection }> {
  const effective = effectivePermissionValues(adminType, permissions);

  return MODULES.map((module) => ({
    module,
    selection: selectedPermissionAction(module, effective),
  }));
}

export function permissionModuleCount(
  adminType: AdminType,
  permissions: Permission[],
): number {
  return permissionSummary(adminType, permissions).filter(
    ({ selection }) => selection !== "none",
  ).length;
}

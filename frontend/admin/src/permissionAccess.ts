import type { AdminType, Permission } from "@shared/types/generated";
import { PermissionValues } from "@shared/types/generated";

export type PermissionAction = "read" | "manage";
export type PermissionSelection = "none" | PermissionAction;

export interface PermissionModule {
  key: string;
  read?: Permission;
  manage?: Permission;
}

const MODULES = buildModules(PermissionValues);

function buildModules(values: readonly Permission[]): PermissionModule[] {
  const modules = new Map<string, PermissionModule>();

  for (const permission of values) {
    const [moduleKey, action] = permission.split(".") as [
      string,
      PermissionAction,
    ];

    const existing = modules.get(moduleKey) ?? { key: moduleKey };
    if (action === "read") {
      existing.read = permission;
    }
    if (action === "manage") {
      existing.manage = permission;
    }
    modules.set(moduleKey, existing);
  }

  return Array.from(modules.values());
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

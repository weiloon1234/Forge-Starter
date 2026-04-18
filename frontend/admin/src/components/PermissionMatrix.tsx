import { Radio } from "@shared/components";
import type { Permission } from "@shared/types/generated";
import { useTranslation } from "react-i18next";
import {
  nextModulePermissions,
  type PermissionAction,
  permissionModules,
  selectedPermissionAction,
} from "@/permissionAccess";

interface PermissionMatrixProps {
  value: Permission[];
  onChange: (value: Permission[]) => void;
  grantable?: Partial<Record<Permission, boolean>>;
  disabled?: boolean;
}

function permissionLabel(
  t: ReturnType<typeof useTranslation>["t"],
  moduleKey: string,
  action: PermissionAction,
): string {
  return t(`permissions.${moduleKey}.${action}`, {
    defaultValue: t(`permissions.${action}`),
  });
}

export function PermissionMatrix({
  value,
  onChange,
  grantable = {},
  disabled = false,
}: PermissionMatrixProps) {
  const { t } = useTranslation();
  const modules = permissionModules();

  return (
    <div className="sf-permission-matrix">
      {modules.map((module) => {
        const selection = selectedPermissionAction(module, value);
        const options = [
          { value: "none", label: t("permissions.none") },
          {
            value: "read",
            label: permissionLabel(t, module.key, "read"),
            disabled: module.read ? grantable[module.read] === false : true,
          },
          ...(module.manage
            ? [
                {
                  value: "manage",
                  label: permissionLabel(t, module.key, "manage"),
                  disabled: grantable[module.manage] === false,
                },
              ]
            : []),
        ];

        return (
          <div key={module.key} className="sf-permission-row">
            <div className="sf-permission-row__meta">
              <div className="sf-permission-row__title">
                {t(`permissions.${module.key}.label`)}
              </div>
            </div>

            <Radio
              name={`permission-${module.key}`}
              className="sf-permission-row__choices"
              orientation="horizontal"
              align="start"
              value={selection}
              disabled={disabled}
              options={options}
              onChange={(next) =>
                onChange(
                  nextModulePermissions(
                    value,
                    module,
                    next as "none" | PermissionAction,
                  ),
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}

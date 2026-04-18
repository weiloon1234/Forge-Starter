import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import type {
  AdminResponse,
  AdminType,
  Permission,
} from "@shared/types/generated";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { type PermissionAction, permissionSummary } from "@/permissionAccess";

interface AdminPermissionsModalProps {
  adminId: string;
  adminType: AdminType;
  onClose: () => void;
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

export function AdminPermissionsModal({
  adminId,
  adminType,
  onClose,
}: AdminPermissionsModalProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const shouldLoadPermissions = adminType === "admin";
  const [loading, setLoading] = useState(shouldLoadPermissions);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!shouldLoadPermissions) {
      setPermissions([]);
      setLoadFailed(false);
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      if (!adminId) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get<AdminResponse>(`/admins/${adminId}`);

        if (!active) {
          return;
        }

        setPermissions(data.permissions);
        setLoadFailed(false);
      } catch {
        if (!active) {
          return;
        }

        setLoadFailed(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [adminId, shouldLoadPermissions]);

  const summary = permissionSummary(adminType, permissions);

  return (
    <>
      <ModalBody>
        <div className="sf-admin-permission-modal">
          <div className="sf-admin-form-section__header">
            <p>
              {adminType === "admin"
                ? t("admin.admins.permissions_modal_help")
                : t("admin.admins.implicit_permissions_help")}
            </p>
          </div>

          {loading ? (
            <div className="sf-page-subtitle">{t("Loading")}</div>
          ) : loadFailed ? (
            <div className="sf-form-error-banner">
              {t("error.something_went_wrong")}
            </div>
          ) : (
            <div className="sf-permission-summary">
              {summary.map(({ module, selection }) => (
                <div key={module.key} className="sf-permission-summary-row">
                  <div className="sf-permission-summary-row__meta">
                    <div className="sf-permission-row__title">
                      {t(`permissions.${module.key}.label`)}
                    </div>
                    <div className="sf-permission-row__subtitle">
                      {module.manage
                        ? [
                            module.read
                              ? permissionLabel(t, module.key, "read")
                              : null,
                            permissionLabel(t, module.key, "manage"),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : module.read
                          ? permissionLabel(t, module.key, "read")
                          : ""}
                    </div>
                  </div>
                  <span
                    className={`sf-permission-summary-badge sf-permission-summary-badge--${selection}`}
                  >
                    {selection === "none"
                      ? t("permissions.none")
                      : permissionLabel(t, module.key, selection)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t("Close")}
        </Button>
      </ModalFooter>
    </>
  );
}

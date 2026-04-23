import { Button, Input, Select } from "@shared/components";
import { getConfig } from "@shared/config";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter, modal } from "@shared/modal";
import type {
  AdminPermissionResponse,
  AdminResponse,
  AdminType,
  Permission,
} from "@shared/types/generated";
import { AdminTypeOptions, AdminTypeValues } from "@shared/types/generated";
import { enumOptions } from "@shared/utils";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminFormModeForTarget, canDeleteAdminTarget } from "@/adminAccess";
import {
  type AdminFormValues,
  adminFormValuesFromResponse,
  buildCreateAdminPayload,
  buildUpdateAdminPayload,
  emptyAdminFormValues,
} from "@/adminForm";
import { api } from "@/api";
import { auth } from "@/auth";
import { ConfirmDeleteAdminModal } from "@/components/ConfirmDeleteAdminModal";
import { PermissionMatrix } from "@/components/PermissionMatrix";
import { hasPermission } from "@/hooks/usePermission";
import { permissions } from "@/permissions";

const FORM_ID = "admin-form-modal";

interface AdminFormModalProps {
  adminId?: string;
  onSaved?: () => void;
  onClose: () => void;
}

type ModalMode = "create" | "edit" | "view";

function modeTitleKey(mode: ModalMode): string {
  switch (mode) {
    case "create":
      return "admin.admins.create_title";
    case "edit":
      return "admin.admins.edit_title";
    case "view":
      return "admin.admins.view_title";
  }
}

function modeHelpKey(mode: ModalMode, isSelf: boolean): string {
  if (mode === "create") {
    return "admin.admins.create_help";
  }

  if (mode === "edit") {
    return "admin.admins.edit_help";
  }

  return isSelf ? "admin.admins.view_self_help" : "admin.admins.view_help";
}

function buildAdminTypeOptions(
  actorType: AdminType | undefined,
  currentType: AdminType,
): AdminType[] {
  const baseValues =
    actorType === "developer"
      ? AdminTypeValues.filter((type) => type !== "developer")
      : (["admin"] as AdminType[]);

  return baseValues.includes(currentType)
    ? [...baseValues]
    : [...baseValues, currentType];
}

export function AdminFormModal({
  adminId,
  onSaved,
  onClose,
}: AdminFormModalProps) {
  const { t } = useTranslation();
  const { default_locale } = getConfig();
  const { user } = auth.useAuth();
  const isCreate = !adminId;
  const canManageAdmins = hasPermission(
    user?.abilities,
    permissions.admins.manage,
    user?.admin_type,
  );
  const createLocale = user?.locale ?? default_locale;

  const [loading, setLoading] = useState(true);
  const [loadedAdmin, setLoadedAdmin] = useState<AdminResponse | null>(null);
  const [mode, setMode] = useState<ModalMode>(isCreate ? "create" : "view");
  const [grantable, setGrantable] = useState<
    Partial<Record<Permission, boolean>>
  >({});

  const form = useForm<AdminFormValues>({
    initialValues: emptyAdminFormValues(createLocale),
    onSubmit: async (values) => {
      if (isCreate) {
        await api.post("/admins", buildCreateAdminPayload(values));
        toast.success(t("admin.admins.created"));
      } else if (adminId) {
        await api.put(`/admins/${adminId}`, buildUpdateAdminPayload(values));
        toast.success(t("admin.admins.updated"));
      }

      onSaved?.();
      onClose();
    },
  });
  const { setValues } = form;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadedAdmin(null);
      setMode(isCreate ? "create" : "view");
      setValues(emptyAdminFormValues(createLocale));

      if (isCreate && !canManageAdmins) {
        onClose();
        return;
      }

      try {
        const [{ data: grantableRows }, adminResponse] = await Promise.all([
          api.get<AdminPermissionResponse[]>("/admins/permissions"),
          adminId
            ? api.get<AdminResponse>(`/admins/${adminId}`)
            : Promise.resolve(null),
        ]);

        if (!active) {
          return;
        }

        setGrantable(
          Object.fromEntries(
            grantableRows.map((entry) => [entry.permission, entry.grantable]),
          ) as Partial<Record<Permission, boolean>>,
        );

        if (adminResponse) {
          const nextAdmin = adminResponse.data;
          setLoadedAdmin(nextAdmin);
          setMode(
            !canManageAdmins ? "view" : adminFormModeForTarget(user, nextAdmin),
          );
          setValues(adminFormValuesFromResponse(nextAdmin));
        }

        setLoading(false);
      } catch {
        if (active) {
          onClose();
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [
    adminId,
    canManageAdmins,
    createLocale,
    isCreate,
    onClose,
    setValues,
    user,
  ]);

  const usernameField = form.field("username");
  const emailField = form.field("email");
  const nameField = form.field("name");
  const passwordField = form.field("password");
  const adminTypeField = form.field("admin_type");
  const permissionsField = form.field("permissions");

  const allowedAdminTypes = buildAdminTypeOptions(
    user?.admin_type,
    loadedAdmin?.admin_type ?? form.values.admin_type,
  );
  const adminTypeOptions = enumOptions(
    AdminTypeOptions.filter((option) =>
      allowedAdminTypes.includes(option.value),
    ),
    t,
  );

  const isViewMode = mode === "view";
  const isSelf = !!loadedAdmin && user?.id === loadedAdmin.id;
  const canDelete =
    !!loadedAdmin && canManageAdmins && canDeleteAdminTarget(user, loadedAdmin);
  const showPermissionMatrix = form.values.admin_type === "admin";

  const openDeleteModal = () => {
    if (!loadedAdmin) {
      return;
    }

    modal.open(
      ConfirmDeleteAdminModal,
      {
        name: loadedAdmin.name,
        onConfirm: async () => {
          await api.delete(`/admins/${loadedAdmin.id}`);
          toast.success(t("admin.admins.deleted"));
          onSaved?.();
          onClose();
        },
      },
      { title: t("Delete") },
    );
  };

  if (loading) {
    return (
      <ModalBody>
        <div className="sf-page-subtitle">{t("Loading")}</div>
      </ModalBody>
    );
  }

  return (
    <>
      <ModalBody>
        <div className="sf-admin-form-page">
          <div>
            <h3 className="sf-page-title">{t(modeTitleKey(mode))}</h3>
            <p className="sf-page-subtitle">{t(modeHelpKey(mode, isSelf))}</p>
          </div>

          {form.formErrors.length > 0 && (
            <div className="sf-form-error-banner">
              {form.formErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          <form
            id={FORM_ID}
            className="sf-admin-form"
            onSubmit={form.handleSubmit}
          >
            <div className="sf-admin-form-grid">
              <Input
                name={usernameField.name}
                label={t("Username")}
                value={usernameField.value}
                onChange={usernameField.onChange}
                onBlur={usernameField.onBlur}
                errors={usernameField.errors}
                disabled={isCreate ? isViewMode : false}
                readOnly={!isCreate}
              />

              <Input
                name={nameField.name}
                label={t("Name")}
                value={nameField.value}
                onChange={nameField.onChange}
                onBlur={nameField.onBlur}
                errors={nameField.errors}
                disabled={isViewMode}
              />

              <Input
                name={emailField.name}
                type="email"
                label={t("Email")}
                value={emailField.value}
                onChange={emailField.onChange}
                onBlur={emailField.onBlur}
                errors={emailField.errors}
                disabled={isViewMode}
              />

              <Input
                name={passwordField.name}
                type="password"
                label={
                  isCreate ? t("Password") : t("admin.admins.new_password")
                }
                value={passwordField.value}
                onChange={passwordField.onChange}
                onBlur={passwordField.onBlur}
                errors={passwordField.errors}
                disabled={isViewMode}
                placeholder={
                  isCreate ? undefined : t("admin.admins.password_placeholder")
                }
              />

              <Select
                name={adminTypeField.name}
                label={t("Admin Type")}
                value={adminTypeField.value}
                options={adminTypeOptions}
                onChange={(value) => {
                  if (typeof value === "string") {
                    adminTypeField.onChange(value as AdminType);
                  }
                }}
                disabled={isViewMode}
                errors={adminTypeField.errors}
              />
            </div>

            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.admins.permissions_title")}</h2>
                <p>
                  {showPermissionMatrix
                    ? t("admin.admins.permissions_help")
                    : t("admin.admins.implicit_permissions_help")}
                </p>
              </div>

              {showPermissionMatrix ? (
                <>
                  <PermissionMatrix
                    value={permissionsField.value}
                    onChange={permissionsField.onChange}
                    grantable={grantable}
                    disabled={isViewMode}
                  />

                  {permissionsField.errors.length > 0 && (
                    <div className="sf-field-errors">
                      {permissionsField.errors.map((error) => (
                        <div key={error}>{error}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="sf-page-subtitle">
                  {t("admin.admins.implicit_permissions_note")}
                </p>
              )}
            </div>
          </form>
        </div>
      </ModalBody>

      <ModalFooter>
        {canDelete && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            prefix={<Trash2 size={16} />}
            onClick={openDeleteModal}
          >
            {t("Delete")}
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t(isViewMode ? "Close" : "Cancel")}
        </Button>
        {!isViewMode && (
          <Button type="submit" size="sm" busy={form.busy} form={FORM_ID}>
            {t("Save")}
          </Button>
        )}
      </ModalFooter>
    </>
  );
}

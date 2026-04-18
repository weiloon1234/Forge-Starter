import { Button, DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { AdminType, Permission } from "@shared/types/generated";
import { Eye, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { adminFormModeForTarget, canManageAdminTarget } from "@/adminAccess";
import { api } from "@/api";
import { auth } from "@/auth";
import { AdminFormModal } from "@/components/AdminFormModal";
import { AdminPermissionsModal } from "@/components/AdminPermissionsModal";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";

const ADMINS_READ: Permission = "admins.read";
const ADMINS_MANAGE: Permission = "admins.manage";
const EXPORTS_READ: Permission = "exports.read";

interface AdminRow {
  id: string;
  username: string;
  email: string;
  name: string;
  admin_type: AdminType;
  permission_count: number;
  created_at: string;
}

interface AdminsPageProps {
  modalRouteIntent?: { kind: "create" } | { kind: "target"; id: string };
  onRouteModalClose?: () => void;
}

export function AdminsPage({
  modalRouteIntent,
  onRouteModalClose,
}: AdminsPageProps = {}) {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const tableRefresh = useRef<(() => void) | null>(null);
  const routeModalKeyRef = useRef<string | null>(null);
  const canManageAdmins = usePermission(ADMINS_MANAGE);
  const canExport = hasAllPermissions(
    user?.abilities,
    [ADMINS_READ, EXPORTS_READ],
    user?.admin_type,
  );

  const openCreateModal = useCallback(
    (onClose?: () => void) => {
      modal.open(
        AdminFormModal,
        {
          onSaved: () => tableRefresh.current?.(),
        },
        {
          title: t("admin.admins.create_title"),
          onClose,
        },
      );
    },
    [t],
  );

  const openTargetModal = useCallback(
    (row: AdminRow, onClose?: () => void) => {
      const mode = canManageAdmins ? adminFormModeForTarget(user, row) : "view";

      modal.open(
        AdminFormModal,
        {
          adminId: row.id,
          onSaved: () => tableRefresh.current?.(),
        },
        {
          title: t(
            mode === "edit"
              ? "admin.admins.edit_title"
              : "admin.admins.view_title",
          ),
          onClose,
        },
      );
    },
    [canManageAdmins, t, user],
  );

  const openTargetModalById = useCallback(
    (id: string, onClose?: () => void) => {
      modal.open(
        AdminFormModal,
        {
          adminId: id,
          onSaved: () => tableRefresh.current?.(),
        },
        {
          title: t("admin.admins.title"),
          onClose,
        },
      );
    },
    [t],
  );

  const openPermissionsModal = useCallback(
    (row: AdminRow) => {
      modal.open(
        AdminPermissionsModal,
        {
          adminId: row.id,
          adminType: row.admin_type,
        },
        {
          title: t("admin.admins.permissions_modal_title", { name: row.name }),
        },
      );
    },
    [t],
  );

  useEffect(() => {
    if (!modalRouteIntent) {
      routeModalKeyRef.current = null;
      return;
    }

    const nextKey =
      modalRouteIntent.kind === "create"
        ? "create"
        : `target:${modalRouteIntent.id}`;

    if (routeModalKeyRef.current === nextKey) {
      return;
    }

    routeModalKeyRef.current = nextKey;

    if (modalRouteIntent.kind === "create") {
      if (!canManageAdmins) {
        onRouteModalClose?.();
        return;
      }

      openCreateModal(onRouteModalClose);
      return;
    }

    openTargetModalById(modalRouteIntent.id, onRouteModalClose);
  }, [
    canManageAdmins,
    modalRouteIntent,
    onRouteModalClose,
    openCreateModal,
    openTargetModalById,
  ]);

  const columns: DataTableColumn<AdminRow>[] = [
    {
      key: "__actions",
      label: "",
      render: (row) => {
        const editable = canManageAdmins && canManageAdminTarget(user, row);

        return (
          <Button
            type="button"
            unstyled
            className="sf-datatable-action"
            ariaLabel={editable ? t("admin.admins.edit") : t("View")}
            title={editable ? t("admin.admins.edit") : t("View")}
            onClick={() => openTargetModal(row)}
          >
            {editable ? <Pencil size={16} /> : <Eye size={16} />}
          </Button>
        );
      },
    },
    { key: "username", label: t("Username"), sortable: true },
    { key: "name", label: t("Name"), sortable: true },
    { key: "email", label: t("Email"), sortable: true },
    {
      key: "admin_type",
      label: t("Admin Type"),
      sortable: true,
      render: (row) => t(`admin_type.${row.admin_type}`),
    },
    {
      key: "permission_count",
      label: t("admin.admins.permissions_column"),
      render: (row) => (
        <Button
          type="button"
          unstyled
          className="sf-admin-permission-trigger"
          onClick={() => openPermissionsModal(row)}
          title={t("admin.admins.permissions_open")}
          ariaLabel={t("admin.admins.permissions_open")}
        >
          {t("admin.admins.permissions_count", {
            value: row.permission_count,
          })}
        </Button>
      ),
    },
    { key: "created_at", label: t("Created"), sortable: true },
  ];

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{t("admin.admins.title")}</h1>
          <p className="sf-page-subtitle">{t("admin.admins.subtitle")}</p>
        </div>

        {canManageAdmins && (
          <Button
            type="button"
            size="sm"
            prefix={<Plus size={16} />}
            onClick={() => openCreateModal()}
          >
            {t("admin.admins.new")}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <DataTable<AdminRow>
          api={api}
          url="/datatables/admin.admins/query"
          downloadUrl={
            canExport ? "/datatables/admin.admins/download" : undefined
          }
          columns={columns}
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}

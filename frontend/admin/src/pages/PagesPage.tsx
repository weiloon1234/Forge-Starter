import { Button, DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission } from "@shared/types/generated";
import { Eye, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { PageFormModal } from "@/components/PageFormModal";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";

const PAGES_READ: Permission = "pages.read";
const PAGES_MANAGE: Permission = "pages.manage";
const EXPORTS_READ: Permission = "exports.read";

interface PageRow {
  id: string;
  slug: string;
  title: string;
  is_system: boolean;
  updated_at: string | null;
}

interface PagesPageProps {
  modalRouteIntent?: { kind: "create" } | { kind: "target"; id: string };
  onRouteModalClose?: () => void;
}

export function PagesPage({
  modalRouteIntent,
  onRouteModalClose,
}: PagesPageProps = {}) {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const tableRefresh = useRef<(() => void) | null>(null);
  const routeModalKeyRef = useRef<string | null>(null);
  const canReadPages = usePermission(PAGES_READ);
  const canManagePages = usePermission(PAGES_MANAGE);
  const canExport = hasAllPermissions(
    user?.abilities,
    [PAGES_READ, EXPORTS_READ],
    user?.admin_type,
  );

  const openCreateModal = useCallback(
    (onClose?: () => void) => {
      modal.open(
        PageFormModal,
        {
          onSaved: () => tableRefresh.current?.(),
        },
        {
          title: t("admin.pages.create_title"),
          onClose,
        },
      );
    },
    [t],
  );

  const openTargetModal = useCallback((row: PageRow, onClose?: () => void) => {
    modal.open(
      PageFormModal,
      {
        pageId: row.id,
        onSaved: () => tableRefresh.current?.(),
      },
      {
        title: row.title || row.slug,
        onClose,
      },
    );
  }, []);

  const openTargetModalById = useCallback(
    (id: string, onClose?: () => void) => {
      modal.open(
        PageFormModal,
        {
          pageId: id,
          onSaved: () => tableRefresh.current?.(),
        },
        {
          title: t("admin.pages.title"),
          onClose,
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
      if (!canManagePages) {
        onRouteModalClose?.();
        return;
      }

      openCreateModal(onRouteModalClose);
      return;
    }

    openTargetModalById(modalRouteIntent.id, onRouteModalClose);
  }, [
    canManagePages,
    modalRouteIntent,
    onRouteModalClose,
    openCreateModal,
    openTargetModalById,
  ]);

  if (!canReadPages) {
    return <NotFoundPage />;
  }

  const columns: DataTableColumn<PageRow>[] = [
    {
      key: "__actions",
      label: "",
      render: (row) => (
        <Button
          type="button"
          unstyled
          className="sf-datatable-action"
          ariaLabel={
            canManagePages
              ? t("admin.pages.edit_action")
              : t("admin.pages.view_action")
          }
          title={
            canManagePages
              ? t("admin.pages.edit_action")
              : t("admin.pages.view_action")
          }
          onClick={() => openTargetModal(row)}
        >
          {canManagePages ? <Pencil size={16} /> : <Eye size={16} />}
        </Button>
      ),
    },
    {
      key: "slug",
      label: t("admin.pages.columns.slug"),
      sortable: true,
    },
    {
      key: "title",
      label: t("admin.pages.columns.title"),
      sortable: true,
      render: (row) => row.title || "—",
    },
    {
      key: "is_system",
      label: t("admin.pages.columns.system"),
      sortable: true,
      render: (row) => (
        <span
          className={`sf-status-badge sf-status-badge--${row.is_system ? "enabled" : "disabled"}`}
        >
          {row.is_system
            ? t("admin.pages.system_state.system")
            : t("admin.pages.system_state.custom")}
        </span>
      ),
    },
    {
      key: "updated_at",
      label: t("admin.pages.columns.updated"),
      sortable: true,
      render: (row) => row.updated_at ?? "—",
    },
  ];

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{t("admin.pages.title")}</h1>
          <p className="sf-page-subtitle">{t("admin.pages.subtitle")}</p>
        </div>

        {canManagePages && (
          <Button
            type="button"
            size="sm"
            prefix={<Plus size={16} />}
            onClick={() => openCreateModal()}
          >
            {t("admin.pages.new")}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <DataTable<PageRow>
          api={api}
          url="/datatables/admin.pages/query"
          columns={columns}
          downloadUrl={
            canExport ? "/datatables/admin.pages/download" : undefined
          }
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}

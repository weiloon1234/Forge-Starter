import { Button } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import { formatDateTime } from "@shared/utils";
import { Eye, Pencil, Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { actionColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { permissions } from "@/permissions";

interface PageRow {
  id: string;
  slug: string;
  title: string;
  is_system: boolean;
  updated_at: string | null;
}

export function PagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = auth.useAuth();
  const tableRefresh = useRef<(() => void) | null>(null);
  const canReadPages = usePermission(permissions.pages.read);
  const canManagePages = usePermission(permissions.pages.manage);
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.pages.read, permissions.exports.read],
    user?.admin_type,
  );

  if (!canReadPages) {
    return <NotFoundPage />;
  }

  const columns: DataTableColumn<PageRow>[] = [
    actionColumn<PageRow>({
      label: canManagePages
        ? t("admin.pages.edit_action")
        : t("admin.pages.view_action"),
      icon: canManagePages ? <Pencil size={16} /> : <Eye size={16} />,
      onClick: (row) => navigate(`/pages/${row.id}`),
    }),
    {
      key: "slug",
      label: t("Slug"),
      sortable: true,
    },
    {
      key: "title",
      label: t("Title"),
      sortable: true,
      render: (row) => row.title || "—",
    },
    {
      key: "is_system",
      label: t("System"),
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
      label: t("Updated"),
      sortable: true,
      render: (row) => (row.updated_at ? formatDateTime(row.updated_at) : "—"),
    },
  ];

  return (
    <AdminDatatablePage<PageRow>
      title={t("admin.pages.title")}
      subtitle={t("admin.pages.subtitle")}
      action={
        canManagePages ? (
          <Button
            type="button"
            size="sm"
            prefix={<Plus size={16} />}
            onClick={() => navigate("/pages/new")}
          >
            {t("admin.pages.new")}
          </Button>
        ) : undefined
      }
      datatable={{
        url: "/datatables/admin.pages/query",
        columns,
        downloadUrl: canExport ? "/datatables/admin.pages/download" : undefined,
        refreshRef: tableRefresh,
      }}
    />
  );
}

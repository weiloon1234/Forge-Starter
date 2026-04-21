import { Button, DataTable } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission } from "@shared/types/generated";
import { formatDateTime } from "@shared/utils";
import { Eye, Pencil, Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import { auth } from "@/auth";
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

export function PagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = auth.useAuth();
  const tableRefresh = useRef<(() => void) | null>(null);
  const canReadPages = usePermission(PAGES_READ);
  const canManagePages = usePermission(PAGES_MANAGE);
  const canExport = hasAllPermissions(
    user?.abilities,
    [PAGES_READ, EXPORTS_READ],
    user?.admin_type,
  );

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
          onClick={() => navigate(`/pages/${row.id}`)}
        >
          {canManagePages ? <Pencil size={16} /> : <Eye size={16} />}
        </Button>
      ),
    },
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
            onClick={() => navigate("/pages/new")}
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

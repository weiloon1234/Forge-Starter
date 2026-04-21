import { DataTable } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission } from "@shared/types/generated";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";

const INTRODUCER_CHANGES_READ: Permission = "introducer_changes.read";
const EXPORTS_READ: Permission = "exports.read";

interface IntroducerChangeRow {
  id: string;
  created_at: string;
  user_label: string;
  from_introducer_label: string;
  to_introducer_label: string;
  admin_label: string;
}

export function IntroducerChangesPage() {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const canReadIntroducerChanges = usePermission(INTRODUCER_CHANGES_READ);
  const canExport = hasAllPermissions(
    user?.abilities,
    [INTRODUCER_CHANGES_READ, EXPORTS_READ],
    user?.admin_type,
  );

  if (!canReadIntroducerChanges) {
    return <NotFoundPage />;
  }

  const columns: DataTableColumn<IntroducerChangeRow>[] = [
    {
      key: "created_at",
      label: t("admin.introducer_changes.columns.created"),
      sortable: true,
      format: "datetime",
    },
    {
      key: "user_label",
      label: t("admin.introducer_changes.columns.user"),
      sortable: true,
    },
    {
      key: "from_introducer_label",
      label: t("admin.introducer_changes.columns.from_introducer"),
      sortable: true,
    },
    {
      key: "to_introducer_label",
      label: t("admin.introducer_changes.columns.to_introducer"),
      sortable: true,
    },
    {
      key: "admin_label",
      label: t("admin.introducer_changes.columns.admin"),
      sortable: true,
    },
  ];

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">
            {t("admin.introducer_changes.title")}
          </h1>
          <p className="sf-page-subtitle">
            {t("admin.introducer_changes.subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <DataTable<IntroducerChangeRow>
          api={api}
          url="/datatables/admin.introducer_changes/query"
          columns={columns}
          downloadUrl={
            canExport
              ? "/datatables/admin.introducer_changes/download"
              : undefined
          }
          defaultPerPage={20}
        />
      </div>
    </div>
  );
}

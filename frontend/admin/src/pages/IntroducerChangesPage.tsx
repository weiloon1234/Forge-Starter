import type { DataTableColumn } from "@shared/types/form";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { createdAtColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { permissions } from "@/permissions";

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
  const canReadIntroducerChanges = usePermission(
    permissions.introducerChanges.read,
  );
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.introducerChanges.read, permissions.exports.read],
    user?.admin_type,
  );

  if (!canReadIntroducerChanges) {
    return <NotFoundPage />;
  }

  const columns: DataTableColumn<IntroducerChangeRow>[] = [
    createdAtColumn<IntroducerChangeRow>(t),
    {
      key: "user_label",
      label: t("User"),
      sortable: true,
    },
    {
      key: "from_introducer_label",
      label: t("From introducer"),
      sortable: true,
    },
    {
      key: "to_introducer_label",
      label: t("To introducer"),
      sortable: true,
    },
    {
      key: "admin_label",
      label: t("Admin"),
      sortable: true,
    },
  ];

  return (
    <AdminDatatablePage<IntroducerChangeRow>
      title={t("admin.introducer_changes.title")}
      subtitle={t("admin.introducer_changes.subtitle")}
      datatable={{
        url: "/datatables/admin.introducer_changes/query",
        columns,
        downloadUrl: canExport
          ? "/datatables/admin.introducer_changes/download"
          : undefined,
      }}
    />
  );
}

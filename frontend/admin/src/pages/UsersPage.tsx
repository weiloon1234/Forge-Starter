import { DataTable } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission, UserStatus } from "@shared/types/generated";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { hasAllPermissions } from "@/hooks/usePermission";

const USERS_READ: Permission = "users.read";
const EXPORTS_READ: Permission = "exports.read";

interface UserRow {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export function UsersPage() {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const canExport = hasAllPermissions(
    user?.abilities,
    [USERS_READ, EXPORTS_READ],
    user?.admin_type,
  );

  const columns: DataTableColumn<UserRow>[] = [
    { key: "email", label: t("Email"), sortable: true },
    { key: "name", label: t("Name"), sortable: true },
    {
      key: "status",
      label: t("Status"),
      sortable: true,
      render: (row) => (
        <span className={`sf-status-badge sf-status-badge--${row.status}`}>
          {t(row.status)}
        </span>
      ),
    },
    { key: "created_at", label: t("Created"), sortable: true },
  ];

  return (
    <div>
      <h1 className="sf-page-title">{t("admin.users.title")}</h1>
      <p className="sf-page-subtitle">{t("admin.users.subtitle")}</p>

      <div className="mt-4">
        <DataTable<UserRow>
          api={api}
          url="/datatables/admin.users/query"
          downloadUrl={
            canExport ? "/datatables/admin.users/download" : undefined
          }
          columns={columns}
          defaultPerPage={20}
        />
      </div>
    </div>
  );
}

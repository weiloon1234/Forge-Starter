import { DataTable } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission } from "@shared/types/generated";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { hasAllPermissions } from "@/hooks/usePermission";

const USERS_READ: Permission = "users.read";
const EXPORTS_READ: Permission = "exports.read";

interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  country_iso2: string | null;
  contact_country_iso2: string | null;
  contact_number: string | null;
  created_at: string;
}

function displayValue(value: string | null) {
  return value ?? "-";
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
    {
      key: "username",
      label: t("Username"),
      sortable: true,
      render: (row) => displayValue(row.username),
    },
    {
      key: "email",
      label: t("Email"),
      sortable: true,
      render: (row) => displayValue(row.email),
    },
    {
      key: "name",
      label: t("Name"),
      sortable: true,
      render: (row) => displayValue(row.name),
    },
    {
      key: "country_iso2",
      label: t("Country"),
      sortable: true,
      render: (row) => displayValue(row.country_iso2),
    },
    {
      key: "contact_country_iso2",
      label: t("Contact country"),
      sortable: true,
      render: (row) => displayValue(row.contact_country_iso2),
    },
    {
      key: "contact_number",
      label: t("Contact number"),
      sortable: true,
      render: (row) => displayValue(row.contact_number),
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

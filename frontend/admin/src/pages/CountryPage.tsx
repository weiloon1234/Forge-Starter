import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { CountryStatus } from "@shared/types/generated";
import { CountryStatusOptions } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { Eye } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { EditCountryModal } from "@/components/EditCountryModal";
import { actionColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { permissions } from "@/permissions";

interface CountryRow {
  iso2: string;
  name: string;
  flag_emoji: string | null;
  region: string | null;
  calling_code: string | null;
  primary_currency_code: string | null;
  conversion_rate: number | null;
  is_default: boolean;
  status: CountryStatus;
}

export function CountryPage() {
  const { t } = useTranslation();
  const tableRefresh = useRef<(() => void) | null>(null);
  const { user } = auth.useAuth();
  const canManageCountries = usePermission(permissions.countries.manage);
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.countries.read, permissions.exports.read],
    user?.admin_type,
  );

  const openEdit = (row: CountryRow) => {
    modal.open(
      EditCountryModal,
      {
        iso2: row.iso2,
        status: row.status,
        conversionRate: row.conversion_rate,
        isDefault: row.is_default,
      },
      {
        title: `${row.flag_emoji ?? ""} ${row.name}`.trim(),
        onClose: () => tableRefresh.current?.(),
      },
    );
  };

  const columns: DataTableColumn<CountryRow>[] = [
    ...(canManageCountries
      ? [
          actionColumn<CountryRow>({
            label: t("View"),
            icon: <Eye size={16} />,
            onClick: openEdit,
          }),
        ]
      : []),
    {
      key: "name",
      label: t("Country"),
      sortable: true,
      render: (row) => (
        <span>
          {row.flag_emoji && <span className="mr-2">{row.flag_emoji}</span>}
          {row.name}
        </span>
      ),
    },
    {
      key: "conversion_rate",
      label: t("Rate"),
      sortable: true,
      render: (row) => <span>{row.conversion_rate ?? "—"}</span>,
    },
    {
      key: "is_default",
      label: t("Default"),
      sortable: true,
      render: (row) =>
        row.is_default ? (
          <span className="sf-status-badge sf-status-badge--enabled">
            {t("Default")}
          </span>
        ) : (
          <span>—</span>
        ),
    },
    {
      key: "status",
      label: t("Status"),
      sortable: true,
      render: (row) => (
        <span className={`sf-status-badge sf-status-badge--${row.status}`}>
          {enumLabel(CountryStatusOptions, row.status, t)}
        </span>
      ),
    },
    { key: "iso2", label: t("ISO2"), sortable: true },
    { key: "region", label: t("Region"), sortable: true },
    { key: "primary_currency_code", label: t("Currency"), sortable: true },
    { key: "calling_code", label: t("Calling Code"), sortable: true },
  ];

  return (
    <AdminDatatablePage<CountryRow>
      title={t("Countries")}
      subtitle={t("countries_subtitle")}
      datatable={{
        url: "/datatables/admin.countries/query",
        columns,
        downloadUrl: canExport
          ? "/datatables/admin.countries/download"
          : undefined,
        refreshRef: tableRefresh,
      }}
    />
  );
}

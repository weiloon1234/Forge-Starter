import { Button, DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { CountryStatus, Permission } from "@shared/types/generated";
import { Eye } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { EditCountryModal } from "@/components/EditCountryModal";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";

const COUNTRIES_READ: Permission = "countries.read";
const COUNTRIES_MANAGE: Permission = "countries.manage";
const EXPORTS_READ: Permission = "exports.read";

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
  const canManageCountries = usePermission(COUNTRIES_MANAGE);
  const canExport = hasAllPermissions(
    user?.abilities,
    [COUNTRIES_READ, EXPORTS_READ],
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
          {
            key: "__actions",
            label: "",
            render: (row: CountryRow) => (
              <Button
                type="button"
                unstyled
                className="sf-datatable-action"
                ariaLabel={t("View")}
                title={t("View")}
                onClick={() => openEdit(row)}
              >
                <Eye size={16} />
              </Button>
            ),
          },
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
          {t(row.status)}
        </span>
      ),
    },
    { key: "iso2", label: t("ISO2"), sortable: true },
    { key: "region", label: t("Region"), sortable: true },
    { key: "primary_currency_code", label: t("Currency"), sortable: true },
    { key: "calling_code", label: t("Calling Code"), sortable: true },
  ];

  return (
    <div>
      <h1 className="sf-page-title">{t("Countries")}</h1>
      <p className="sf-page-subtitle">{t("countries_subtitle")}</p>

      <div className="mt-4">
        <DataTable<CountryRow>
          api={api}
          url="/datatables/admin.countries/query"
          columns={columns}
          downloadUrl={
            canExport ? "/datatables/admin.countries/download" : undefined
          }
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}

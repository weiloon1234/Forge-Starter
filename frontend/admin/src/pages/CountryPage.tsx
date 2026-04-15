import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import { api } from "@/api";
import { EditCountryModal } from "@/components/EditCountryModal";
import type { CountryStatus } from "@shared/types/generated";
import type { DataTableColumn } from "@shared/types/form";

interface CountryRow {
  iso2: string;
  name: string;
  flag_emoji: string | null;
  region: string | null;
  calling_code: string | null;
  primary_currency_code: string | null;
  conversion_rate: number | null;
  status: CountryStatus;
}

export function CountryPage() {
  const { t } = useTranslation();
  const tableRefresh = useRef<(() => void) | null>(null);

  const openEdit = (row: CountryRow) => {
    modal.open(EditCountryModal, {
      iso2: row.iso2,
      name: row.name,
      status: row.status,
      conversionRate: row.conversion_rate,
    }, {
      title: `${row.flag_emoji ?? ""} ${row.name}`.trim(),
      onClose: () => tableRefresh.current?.(),
    });
  };

  const columns: DataTableColumn<CountryRow>[] = [
    {
      key: "__actions",
      label: "",
      render: (row) => (
        <button
          type="button"
          className="sf-datatable-action"
          onClick={() => openEdit(row)}
        >
          <Eye size={16} />
        </button>
      ),
    },
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
          downloadUrl="/datatables/admin.countries/download"
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}

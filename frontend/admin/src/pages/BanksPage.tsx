import { Button } from "@shared/components";
import { modal } from "@shared/modal";
import { toast } from "@shared/toast";
import type { DataTableColumn } from "@shared/types/form";
import type { BankDatatableRow } from "@shared/types/generated";
import { formatDateTime } from "@shared/utils";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, RouteIds, routeUrl } from "@/api";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { BankFormModal } from "@/components/BankFormModal";
import { ConfirmDeleteBankModal } from "@/components/ConfirmDeleteBankModal";
import { usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { permissions } from "@/permissions";

export function BanksPage() {
  const { t } = useTranslation();
  const tableRefresh = useRef<(() => void) | null>(null);
  const canRead = usePermission(permissions.banks.read);
  const canManage = usePermission(permissions.banks.manage);

  if (!canRead) {
    return <NotFoundPage />;
  }

  const openCreateModal = () => {
    modal.open(
      BankFormModal,
      { onSaved: () => tableRefresh.current?.() },
      {
        title: t("Create Bank"),
        containerClassName: "sf-modal-container--wide",
      },
    );
  };

  const openEditModal = (row: BankDatatableRow) => {
    modal.open(
      BankFormModal,
      {
        bankId: row.id,
        onSaved: () => tableRefresh.current?.(),
      },
      {
        title: t("Edit Bank"),
        containerClassName: "sf-modal-container--wide",
      },
    );
  };

  const openDeleteModal = (row: BankDatatableRow) => {
    modal.open(
      ConfirmDeleteBankModal,
      {
        name: row.name,
        onConfirm: async () => {
          await api.delete(
            routeUrl(RouteIds.admin.banks.destroy, { id: row.id }),
          );
          toast.success(t("Bank deleted"));
          modal.close();
          tableRefresh.current?.();
        },
      },
      { title: t("Delete Bank") },
    );
  };

  const columns: DataTableColumn<BankDatatableRow>[] = [
    ...(canManage
      ? [
          {
            key: "__actions",
            label: "",
            render: (row: BankDatatableRow) => (
              <div className="sf-datatable-actions">
                <Button
                  type="button"
                  unstyled
                  className="sf-datatable-action"
                  ariaLabel={t("Edit Bank")}
                  title={t("Edit Bank")}
                  onClick={() => openEditModal(row)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  type="button"
                  unstyled
                  className="sf-datatable-action sf-datatable-action--danger"
                  ariaLabel={t("Delete Bank")}
                  title={t("Delete Bank")}
                  onClick={() => openDeleteModal(row)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "country_iso2",
      label: t("Country"),
      sortable: true,
    },
    {
      key: "name",
      label: t("Name"),
      sortable: true,
    },
    {
      key: "created_at",
      label: t("Created"),
      sortable: true,
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: "updated_at",
      label: t("Updated"),
      sortable: true,
      render: (row) => formatDateTime(row.updated_at),
    },
  ];

  return (
    <AdminDatatablePage<BankDatatableRow>
      title={t("Banks")}
      action={
        canManage ? (
          <Button
            type="button"
            size="sm"
            prefix={<Plus size={16} />}
            onClick={openCreateModal}
          >
            {t("New Bank")}
          </Button>
        ) : undefined
      }
      datatable={{
        url: "/datatables/admin.banks/query",
        columns,
        refreshRef: tableRefresh,
      }}
    />
  );
}

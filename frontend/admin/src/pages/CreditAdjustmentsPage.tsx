import { Button } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type {
  CreditTransactionType,
  CreditType,
} from "@shared/types/generated";
import {
  CreditTransactionTypeOptions,
  CreditTypeOptions,
} from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { CreateCreditAdjustmentModal } from "@/components/CreateCreditAdjustmentModal";
import { createdAtColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { permissions } from "@/permissions";

interface CreditAdjustmentRow {
  id: string;
  user_label: string;
  credit_type: CreditType;
  transaction_type: CreditTransactionType;
  amount: string;
  admin_label: string;
  remark: string | null;
  created_at: string;
}

export function CreditAdjustmentsPage() {
  const { t } = useTranslation();
  const tableRefresh = useRef<(() => void) | null>(null);
  const { user } = auth.useAuth();
  const canReadCredits = usePermission(permissions.credits.read);
  const canManageCredits = usePermission(permissions.credits.manage);
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.credits.read, permissions.exports.read],
    user?.admin_type,
  );

  if (!canReadCredits) {
    return <NotFoundPage />;
  }

  const columns: DataTableColumn<CreditAdjustmentRow>[] = [
    {
      key: "user_label",
      label: t("User"),
      sortable: true,
    },
    {
      key: "credit_type",
      label: t("Credit type"),
      sortable: true,
      render: (row) => enumLabel(CreditTypeOptions, row.credit_type, t),
    },
    {
      key: "amount",
      label: t("Amount"),
      sortable: true,
      render: (row) => row.amount,
    },
    {
      key: "admin_label",
      label: t("Admin"),
      sortable: true,
    },
    {
      key: "transaction_type",
      label: t("Transaction type"),
      sortable: true,
      render: (row) =>
        enumLabel(CreditTransactionTypeOptions, row.transaction_type, t),
    },
    {
      key: "remark",
      label: t("Remark"),
      render: (row) => row.remark ?? "—",
    },
    createdAtColumn<CreditAdjustmentRow>(t),
  ];

  return (
    <AdminDatatablePage<CreditAdjustmentRow>
      title={t("admin.credits.title")}
      subtitle={t("admin.credits.subtitle")}
      action={
        canManageCredits ? (
          <Button
            type="button"
            size="sm"
            prefix={<Plus size={16} />}
            onClick={() =>
              modal.open(
                CreateCreditAdjustmentModal,
                {
                  onSaved: () => tableRefresh.current?.(),
                },
                {
                  title: t("admin.credits.create_title"),
                },
              )
            }
          >
            {t("admin.credits.new")}
          </Button>
        ) : undefined
      }
      datatable={{
        url: "/datatables/admin.credit_adjustments/query",
        columns,
        downloadUrl: canExport
          ? "/datatables/admin.credit_adjustments/download"
          : undefined,
        refreshRef: tableRefresh,
      }}
    />
  );
}

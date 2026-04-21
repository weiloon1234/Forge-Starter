import { Button, DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type {
  CreditTransactionType,
  CreditType,
  Permission,
} from "@shared/types/generated";
import {
  CreditTransactionTypeOptions,
  CreditTypeOptions,
} from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { CreateCreditAdjustmentModal } from "@/components/CreateCreditAdjustmentModal";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";

const CREDITS_READ: Permission = "credits.read";
const CREDITS_MANAGE: Permission = "credits.manage";
const EXPORTS_READ: Permission = "exports.read";

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
  const canReadCredits = usePermission(CREDITS_READ);
  const canManageCredits = usePermission(CREDITS_MANAGE);
  const canExport = hasAllPermissions(
    user?.abilities,
    [CREDITS_READ, EXPORTS_READ],
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
    {
      key: "created_at",
      label: t("Created"),
      sortable: true,
      format: "datetime",
    },
  ];

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{t("admin.credits.title")}</h1>
          <p className="sf-page-subtitle">{t("admin.credits.subtitle")}</p>
        </div>

        {canManageCredits && (
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
        )}
      </div>

      <div className="mt-4">
        <DataTable<CreditAdjustmentRow>
          api={api}
          url="/datatables/admin.credit_adjustments/query"
          columns={columns}
          downloadUrl={
            canExport
              ? "/datatables/admin.credit_adjustments/download"
              : undefined
          }
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}

import { DataTable } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import type {
  CreditTransactionType,
  Permission,
} from "@shared/types/generated";
import { CreditTransactionTypeOptions } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";

const CREDIT_TRANSACTIONS_READ: Permission = "credit_transactions.read";
const EXPORTS_READ: Permission = "exports.read";

interface CreditTransactionRow {
  id: string;
  user_username?: string | null;
  transaction_type: CreditTransactionType;
  amount: string;
  created_at: string;
}

export function CreditTransactionsPage() {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const canReadCreditTransactions = usePermission(CREDIT_TRANSACTIONS_READ);
  const canExport = hasAllPermissions(
    user?.abilities,
    [CREDIT_TRANSACTIONS_READ, EXPORTS_READ],
    user?.admin_type,
  );

  if (!canReadCreditTransactions) {
    return <NotFoundPage />;
  }

  const columns: DataTableColumn<CreditTransactionRow>[] = [
    {
      key: "user_username",
      label: t("Username"),
      sortable: true,
      render: (row) => row.user_username ?? "—",
    },
    {
      key: "transaction_type",
      label: t("admin.credit_transactions.columns.transaction_type"),
      sortable: true,
      render: (row) =>
        enumLabel(CreditTransactionTypeOptions, row.transaction_type, t),
    },
    {
      key: "amount",
      label: t("admin.credit_transactions.columns.amount"),
      sortable: true,
      render: (row) => row.amount,
    },
    {
      key: "created_at",
      label: t("admin.credit_transactions.columns.created"),
      sortable: true,
      format: "datetime",
    },
  ];

  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">
            {t("admin.credit_transactions.title")}
          </h1>
          <p className="sf-page-subtitle">
            {t("admin.credit_transactions.subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <DataTable<CreditTransactionRow>
          api={api}
          url="/datatables/admin.credit_transactions/query"
          columns={columns}
          downloadUrl={
            canExport
              ? "/datatables/admin.credit_transactions/download"
              : undefined
          }
          defaultPerPage={20}
        />
      </div>
    </div>
  );
}

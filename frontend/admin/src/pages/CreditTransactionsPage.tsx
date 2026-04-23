import type { DataTableColumn } from "@shared/types/form";
import type { CreditTransactionType } from "@shared/types/generated";
import { CreditTransactionTypeOptions } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { createdAtColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { permissions } from "@/permissions";

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
  const canReadCreditTransactions = usePermission(
    permissions.creditTransactions.read,
  );
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.creditTransactions.read, permissions.exports.read],
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
      label: t("Transaction type"),
      sortable: true,
      render: (row) =>
        enumLabel(CreditTransactionTypeOptions, row.transaction_type, t),
    },
    {
      key: "amount",
      label: t("Amount"),
      sortable: true,
      render: (row) => row.amount,
    },
    createdAtColumn<CreditTransactionRow>(t),
  ];

  return (
    <AdminDatatablePage<CreditTransactionRow>
      title={t("admin.credit_transactions.title")}
      subtitle={t("admin.credit_transactions.subtitle")}
      datatable={{
        url: "/datatables/admin.credit_transactions/query",
        columns,
        downloadUrl: canExport
          ? "/datatables/admin.credit_transactions/download"
          : undefined,
      }}
    />
  );
}

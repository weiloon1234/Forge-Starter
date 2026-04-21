import { DataTable } from "@shared/components";
import { ModalBody } from "@shared/modal";
import type { DataTableColumn, DataTableFilter } from "@shared/types/form";
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
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { hasAllPermissions } from "@/hooks/usePermission";

const CREDIT_TRANSACTIONS_READ: Permission = "credit_transactions.read";
const EXPORTS_READ: Permission = "exports.read";

interface UserCreditTransactionsModalProps {
  userId: string;
  userLabel: string;
  creditType: CreditType;
  onClose: () => void;
}

interface CreditTransactionRow {
  id: string;
  transaction_type: CreditTransactionType;
  amount: string;
  created_at: string;
}

export function UserCreditTransactionsModal({
  userId,
  userLabel,
  creditType,
}: UserCreditTransactionsModalProps) {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const creditTypeLabel = enumLabel(CreditTypeOptions, creditType, t);
  const canExport = hasAllPermissions(
    user?.abilities,
    [CREDIT_TRANSACTIONS_READ, EXPORTS_READ],
    user?.admin_type,
  );

  const baseFilters = useMemo<DataTableFilter[]>(
    () => [
      {
        field: "user_id",
        op: "eq",
        value: { text: userId },
      },
      {
        field: "credit_type",
        op: "eq",
        value: { text: creditType },
      },
    ],
    [creditType, userId],
  );

  const columns: DataTableColumn<CreditTransactionRow>[] = [
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
    <ModalBody className="p-0">
      <DataTable<CreditTransactionRow>
        api={api}
        url="/datatables/admin.user_credit_transactions/query"
        subtitle={t("admin.users.credit_transactions_modal_subtitle", {
          user: userLabel,
          credit_type: creditTypeLabel,
        })}
        columns={columns}
        baseFilters={baseFilters}
        downloadUrl={
          canExport
            ? "/datatables/admin.user_credit_transactions/download"
            : undefined
        }
        defaultPerPage={20}
        className="sf-datatable--modal rounded-none border-x-0 border-y-0"
      />
    </ModalBody>
  );
}

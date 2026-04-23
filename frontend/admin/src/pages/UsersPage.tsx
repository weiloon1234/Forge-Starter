import { Button } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { CreditType } from "@shared/types/generated";
import { CreditTypeOptions, CreditTypeValues } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { Pencil, Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { ChangeUserIntroducerModal } from "@/components/ChangeUserIntroducerModal";
import { UserCreditTransactionsModal } from "@/components/UserCreditTransactionsModal";
import { UserFormModal } from "@/components/UserFormModal";
import { balanceForCreditType } from "@/credits";
import { createdAtColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { permissions } from "@/permissions";

const CREDIT_TYPES: CreditType[] = [...CreditTypeValues];

interface UserRow {
  id: string;
  introducer_user_id: string | null;
  introducer_label: string | null;
  username: string | null;
  email: string | null;
  name: string | null;
  credit_1: string;
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
  const tableRefresh = useRef<(() => void) | null>(null);
  const { user } = auth.useAuth();
  const canReadCreditTransactions = usePermission(
    permissions.creditTransactions.read,
  );
  const canManageIntroducerChanges = usePermission(
    permissions.introducerChanges.manage,
  );
  const canManageUsers = usePermission(permissions.users.manage);
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.users.read, permissions.exports.read],
    user?.admin_type,
  );

  const userRowLabel = (row: UserRow) =>
    row.name ?? row.username ?? row.email ?? row.id;

  const openUserCreditTransactionsModal = (
    row: UserRow,
    creditType: CreditType,
  ) => {
    if (!canReadCreditTransactions) {
      return;
    }

    const userLabel = userRowLabel(row);
    const creditTypeLabel = enumLabel(CreditTypeOptions, creditType, t);

    modal.open(
      UserCreditTransactionsModal,
      {
        userId: row.id,
        userLabel,
        creditType,
      },
      {
        title: t("admin.users.credit_transactions_modal_title", {
          user: userLabel,
          credit_type: creditTypeLabel,
        }),
        containerClassName: "sf-modal-container--wide",
      },
    );
  };

  const openChangeIntroducerModal = (row: UserRow) => {
    if (!row.introducer_user_id) {
      return;
    }

    modal.open(
      ChangeUserIntroducerModal,
      {
        userId: row.id,
        userLabel: userRowLabel(row),
        currentIntroducerUserId: row.introducer_user_id,
        currentIntroducerLabel: row.introducer_label ?? row.introducer_user_id,
        onSaved: () => tableRefresh.current?.(),
      },
      {
        title: t("admin.introducer_changes.change_title"),
      },
    );
  };

  const openCreateUserModal = () => {
    modal.open(
      UserFormModal,
      { onSaved: () => tableRefresh.current?.() },
      {
        title: t("Create User"),
        containerClassName: "sf-modal-container--wide",
      },
    );
  };

  const openEditUserModal = (row: UserRow) => {
    modal.open(
      UserFormModal,
      {
        userId: row.id,
        initialIntroducerLabel: row.introducer_label,
        onSaved: () => tableRefresh.current?.(),
      },
      {
        title: t("Edit User"),
        containerClassName: "sf-modal-container--wide",
      },
    );
  };

  const creditColumns: DataTableColumn<UserRow>[] = CREDIT_TYPES.map(
    (creditType) => ({
      key: creditType,
      label: enumLabel(CreditTypeOptions, creditType, t),
      sortable: true,
      render: (row: UserRow) => {
        const balance = balanceForCreditType(row, creditType);

        if (!canReadCreditTransactions) {
          return balance;
        }

        const actionLabel = t("admin.users.credit_balance_action", {
          credit_type: enumLabel(CreditTypeOptions, creditType, t),
          user: userRowLabel(row),
        });

        return (
          <Button
            type="button"
            variant="link"
            ariaLabel={actionLabel}
            title={actionLabel}
            onClick={() => openUserCreditTransactionsModal(row, creditType)}
          >
            {balance}
          </Button>
        );
      },
    }),
  );

  const showActionsColumn = canManageUsers || canManageIntroducerChanges;

  const columns: DataTableColumn<UserRow>[] = [
    ...(showActionsColumn
      ? [
          {
            key: "__actions",
            label: "",
            render: (row: UserRow) => {
              if (canManageUsers) {
                return (
                  <Button
                    type="button"
                    unstyled
                    className="sf-datatable-action"
                    ariaLabel={t("Edit user")}
                    title={t("Edit user")}
                    onClick={() => openEditUserModal(row)}
                  >
                    <Pencil size={16} />
                  </Button>
                );
              }
              if (canManageIntroducerChanges && row.introducer_user_id) {
                return (
                  <Button
                    type="button"
                    unstyled
                    className="sf-datatable-action"
                    ariaLabel={t("admin.introducer_changes.change_action")}
                    title={t("admin.introducer_changes.change_action")}
                    onClick={() => openChangeIntroducerModal(row)}
                  >
                    <Pencil size={16} />
                  </Button>
                );
              }
              return null;
            },
          },
        ]
      : []),
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
      key: "introducer_label",
      label: t("Introducer"),
      sortable: true,
      render: (row) => displayValue(row.introducer_label),
    },
    ...creditColumns,
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
    createdAtColumn<UserRow>(t),
  ];

  return (
    <AdminDatatablePage<UserRow>
      title={t("admin.users.title")}
      subtitle={t("admin.users.subtitle")}
      action={
        canManageUsers ? (
          <Button
            type="button"
            size="sm"
            prefix={<Plus size={16} />}
            onClick={openCreateUserModal}
          >
            {t("New User")}
          </Button>
        ) : undefined
      }
      datatable={{
        url: "/datatables/admin.users/query",
        downloadUrl: canExport ? "/datatables/admin.users/download" : undefined,
        columns,
        refreshRef: tableRefresh,
      }}
    />
  );
}

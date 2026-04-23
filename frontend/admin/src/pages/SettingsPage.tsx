import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { SettingType } from "@shared/types/generated";
import { formatDateTime } from "@shared/utils";
import { Pencil } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import { EditSettingModal } from "@/components/EditSettingModal";
import { actionColumn } from "@/datatableColumns";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { permissions } from "@/permissions";
import { settingTypeLabel, summarizeSettingValue } from "@/settings";

interface SettingRow {
  key: string;
  label: string;
  setting_type: SettingType;
  group_name: string;
  is_public: boolean;
  value: unknown;
  updated_at: string | null;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const tableRefresh = useRef<(() => void) | null>(null);
  const { user } = auth.useAuth();
  const canManageSettings = usePermission(permissions.settings.manage);
  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.settings.read, permissions.exports.read],
    user?.admin_type,
  );

  const openEdit = (row: SettingRow) => {
    modal.open(
      EditSettingModal,
      {
        settingKey: row.key,
        onSaved: () => tableRefresh.current?.(),
      },
      {
        title: t("admin.settings.edit_title", {
          label: row.label || row.key,
        }),
      },
    );
  };

  const columns: DataTableColumn<SettingRow>[] = [
    ...(canManageSettings
      ? [
          actionColumn<SettingRow>({
            label: t("admin.settings.edit_action"),
            icon: <Pencil size={16} />,
            onClick: openEdit,
          }),
        ]
      : []),
    {
      key: "key",
      label: t("Key"),
      sortable: true,
    },
    {
      key: "label",
      label: t("Label"),
      sortable: true,
    },
    {
      key: "setting_type",
      label: t("Type"),
      sortable: true,
      render: (row) => settingTypeLabel(row.setting_type, t),
    },
    {
      key: "group_name",
      label: t("Group"),
      sortable: true,
    },
    {
      key: "is_public",
      label: t("Public"),
      sortable: true,
      render: (row) => (
        <span
          className={`sf-status-badge sf-status-badge--${row.is_public ? "enabled" : "disabled"}`}
        >
          {row.is_public
            ? t("admin.settings.public_state.public")
            : t("admin.settings.public_state.private")}
        </span>
      ),
    },
    {
      key: "value",
      label: t("Value"),
      render: (row) => summarizeSettingValue(row.setting_type, row.value, t),
    },
    {
      key: "updated_at",
      label: t("Updated"),
      sortable: true,
      render: (row) => (row.updated_at ? formatDateTime(row.updated_at) : "—"),
    },
  ];

  return (
    <AdminDatatablePage<SettingRow>
      title={t("admin.settings.title")}
      subtitle={t("admin.settings.subtitle")}
      datatable={{
        url: "/datatables/admin.settings/query",
        columns,
        downloadUrl: canExport
          ? "/datatables/admin.settings/download"
          : undefined,
        refreshRef: tableRefresh,
      }}
    />
  );
}

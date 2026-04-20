import { Button, DataTable } from "@shared/components";
import { modal } from "@shared/modal";
import type { DataTableColumn } from "@shared/types/form";
import type { Permission, SettingType } from "@shared/types/generated";
import { Pencil } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { EditSettingModal } from "@/components/EditSettingModal";
import { hasAllPermissions, usePermission } from "@/hooks/usePermission";
import { settingTypeLabel, summarizeSettingValue } from "@/settings";

const SETTINGS_READ: Permission = "settings.read";
const SETTINGS_MANAGE: Permission = "settings.manage";
const EXPORTS_READ: Permission = "exports.read";

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
  const canManageSettings = usePermission(SETTINGS_MANAGE);
  const canExport = hasAllPermissions(
    user?.abilities,
    [SETTINGS_READ, EXPORTS_READ],
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
          {
            key: "__actions",
            label: "",
            render: (row: SettingRow) => (
              <Button
                type="button"
                unstyled
                className="sf-datatable-action"
                ariaLabel={t("admin.settings.edit_action")}
                title={t("admin.settings.edit_action")}
                onClick={() => openEdit(row)}
              >
                <Pencil size={16} />
              </Button>
            ),
          },
        ]
      : []),
    {
      key: "key",
      label: t("admin.settings.columns.key"),
      sortable: true,
    },
    {
      key: "label",
      label: t("admin.settings.columns.label"),
      sortable: true,
    },
    {
      key: "setting_type",
      label: t("admin.settings.columns.type"),
      sortable: true,
      render: (row) => settingTypeLabel(row.setting_type, t),
    },
    {
      key: "group_name",
      label: t("admin.settings.columns.group"),
      sortable: true,
    },
    {
      key: "is_public",
      label: t("admin.settings.columns.public"),
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
      label: t("admin.settings.columns.value"),
      render: (row) => summarizeSettingValue(row.setting_type, row.value, t),
    },
    {
      key: "updated_at",
      label: t("admin.settings.columns.updated"),
      sortable: true,
      render: (row) => row.updated_at ?? "—",
    },
  ];

  return (
    <div>
      <h1 className="sf-page-title">{t("admin.settings.title")}</h1>
      <p className="sf-page-subtitle">{t("admin.settings.subtitle")}</p>

      <div className="mt-4">
        <DataTable<SettingRow>
          api={api}
          url="/datatables/admin.settings/query"
          columns={columns}
          downloadUrl={
            canExport ? "/datatables/admin.settings/download" : undefined
          }
          defaultPerPage={20}
          refreshRef={tableRefresh}
        />
      </div>
    </div>
  );
}

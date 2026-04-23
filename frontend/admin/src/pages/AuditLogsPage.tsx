import type { DataTableColumn } from "@shared/types/form";
import { Eye } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AdminDatatablePage } from "@/components/AdminDatatablePage";
import {
  JsonViewer,
  KeyValueList,
  RightDrawer,
  StatusBadge,
} from "@/components/observability";
import { actionColumn, createdAtColumn } from "@/datatableColumns";
import { hasAllPermissions } from "@/hooks/usePermission";
import type { StatusTone } from "@/observability/utils";
import { permissions } from "@/permissions";

interface AuditLogRow {
  id: string;
  event_type: string;
  subject_model: string;
  subject_table: string;
  subject_id: string;
  area: string | null;
  actor_guard: string | null;
  actor_id: string | null;
  actor_label: string | null;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  before_data: unknown | null;
  after_data: unknown | null;
  changes: unknown | null;
  created_at: string;
}

function eventTone(event: string): StatusTone {
  switch (event) {
    case "created":
      return "success";
    case "updated":
      return "info";
    case "restored":
      return "info";
    case "soft_deleted":
      return "warning";
    case "deleted":
      return "danger";
    default:
      return "neutral";
  }
}

export function AuditLogsPage() {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const tableRefresh = useRef<(() => void) | null>(null);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const canExport = hasAllPermissions(
    user?.abilities,
    [permissions.auditLogs.read, permissions.exports.read],
    user?.admin_type,
  );

  const columns: DataTableColumn<AuditLogRow>[] = [
    actionColumn<AuditLogRow>({
      label: t("admin.audit_logs.view_payload"),
      icon: <Eye size={16} />,
      onClick: setSelected,
    }),
    {
      key: "event_type",
      label: t("admin.audit_logs.columns.event"),
      sortable: true,
      render: (row) => (
        <StatusBadge tone={eventTone(row.event_type)}>
          {t(`admin.audit_logs.events.${row.event_type}`, {
            defaultValue: row.event_type,
          })}
        </StatusBadge>
      ),
    },
    {
      key: "actor_label",
      label: t("admin.audit_logs.columns.actor"),
      sortable: true,
      render: (row) => row.actor_label ?? row.actor_id ?? "-",
    },
    {
      key: "subject_table",
      label: t("admin.audit_logs.columns.subject_table"),
      sortable: true,
    },
    {
      key: "subject_id",
      label: t("admin.audit_logs.columns.subject_id"),
    },
    {
      key: "request_id",
      label: t("admin.audit_logs.columns.request_id"),
      render: (row) => row.request_id ?? "-",
    },
    {
      key: "ip",
      label: t("admin.audit_logs.columns.ip"),
      render: (row) => row.ip ?? "-",
    },
    createdAtColumn<AuditLogRow>(t),
  ];

  return (
    <div>
      <AdminDatatablePage<AuditLogRow>
        title={t("admin.audit_logs.title")}
        subtitle={t("admin.audit_logs.subtitle")}
        datatable={{
          url: "/datatables/admin.audit_logs/query",
          downloadUrl: canExport
            ? "/datatables/admin.audit_logs/download"
            : undefined,
          columns,
          refreshRef: tableRefresh,
        }}
      />

      <RightDrawer
        open={Boolean(selected)}
        title={
          selected
            ? t(`admin.audit_logs.events.${selected.event_type}`, {
                defaultValue: selected.event_type,
              })
            : ""
        }
        subtitle={
          selected ? `${selected.subject_table} · ${selected.subject_id}` : ""
        }
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="sf-obs-drawer-stack">
            <KeyValueList
              items={[
                {
                  key: "area",
                  label: t("admin.audit_logs.columns.area"),
                  value: selected.area ?? "-",
                },
                {
                  key: "actor",
                  label: t("admin.audit_logs.columns.actor"),
                  value: selected.actor_label ?? "-",
                },
                {
                  key: "actor_id",
                  label: t("admin.audit_logs.columns.actor_id"),
                  value: selected.actor_id ?? "-",
                },
                {
                  key: "subject_model",
                  label: t("admin.audit_logs.columns.subject_model"),
                  value: selected.subject_model,
                },
                {
                  key: "request_id",
                  label: t("admin.audit_logs.columns.request_id"),
                  value: selected.request_id ?? "-",
                },
                {
                  key: "ip",
                  label: t("admin.audit_logs.columns.ip"),
                  value: selected.ip ?? "-",
                },
                {
                  key: "user_agent",
                  label: t("admin.audit_logs.columns.user_agent"),
                  value: selected.user_agent ?? "-",
                },
                {
                  key: "created_at",
                  label: t("Created"),
                  value: selected.created_at,
                },
              ]}
            />

            {selected.changes != null && (
              <div className="sf-obs-drawer-section">
                <h3>{t("admin.audit_logs.changes")}</h3>
                <JsonViewer value={selected.changes} />
              </div>
            )}

            <div className="sf-obs-drawer-section">
              <h3>{t("admin.audit_logs.before")}</h3>
              {selected.before_data == null ? (
                <p className="sf-obs-empty">
                  {t("admin.audit_logs.no_before")}
                </p>
              ) : (
                <JsonViewer value={selected.before_data} />
              )}
            </div>

            <div className="sf-obs-drawer-section">
              <h3>{t("admin.audit_logs.after")}</h3>
              {selected.after_data == null ? (
                <p className="sf-obs-empty">{t("admin.audit_logs.no_after")}</p>
              ) : (
                <JsonViewer value={selected.after_data} />
              )}
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

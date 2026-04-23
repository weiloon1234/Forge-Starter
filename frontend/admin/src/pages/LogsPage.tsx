import { Button, CheckboxGroup, Select } from "@shared/components";
import { modal } from "@shared/modal";
import type {
  LogEntryResponse,
  LogFileResponse,
} from "@shared/types/generated";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import { ConfirmDeleteLogModal } from "@/components/ConfirmDeleteLogModal";
import { LogEntryModal } from "@/components/LogEntryModal";
import { usePermission } from "@/hooks/usePermission";
import { permissions } from "@/permissions";

type LogEntryRow = LogEntryResponse & { _key: string };

const LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const TAIL_LIMIT = 500;

function formatSize(bytes: bigint): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function LogsPage() {
  const { t } = useTranslation();
  const canManageLogs = usePermission(permissions.logs.manage);
  const [files, setFiles] = useState<LogFileResponse[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const [entries, setEntries] = useState<LogEntryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    const { data } = await api.get<LogFileResponse[]>("/logs");
    setFiles(data);
    setSelected((current) => {
      if (current && data.some((f) => f.filename === current)) return current;
      return data[0]?.filename ?? null;
    });
  }, []);

  const fetchEntries = useCallback(
    async (filename: string, levelFilter: string[]) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: String(TAIL_LIMIT) });
        if (levelFilter.length > 0) params.set("levels", levelFilter.join(","));
        const { data } = await api.get<LogEntryResponse[]>(
          `/logs/${encodeURIComponent(filename)}?${params.toString()}`,
        );
        const rows: LogEntryRow[] = data.map((entry, i) => ({
          ...entry,
          _key: `${filename}:${entry.timestamp}:${i}:${entry.message.length}`,
        }));
        setEntries(rows);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    if (!selected) {
      setEntries([]);
      return;
    }
    void fetchEntries(selected, levels);
  }, [selected, levels, fetchEntries]);

  const fileOptions = useMemo(
    () =>
      files.map((f) => ({
        value: f.filename,
        label: `${f.filename} (${formatSize(f.size_bytes)})`,
      })),
    [files],
  );

  const levelOptions = useMemo(
    () => LEVELS.map((l) => ({ value: l, label: l })),
    [],
  );

  const openEntry = (entry: LogEntryResponse) => {
    modal.open(LogEntryModal, { entry }, { title: t("Log entry") });
  };

  const handleDelete = () => {
    if (!selected) return;
    const filename = selected;
    modal.open(
      ConfirmDeleteLogModal,
      {
        filename,
        onConfirm: async () => {
          const { data } = await api.delete<{ message: string }>(
            `/logs/${encodeURIComponent(filename)}`,
          );
          toast.success(data.message);
          await fetchFiles();
        },
      },
      { title: t("Delete log") },
    );
  };

  return (
    <div>
      <h1 className="sf-page-title">{t("Logs")}</h1>
      <p className="sf-page-subtitle">{t("logs_subtitle")}</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <Select
            name="log_file"
            label={t("Log file")}
            value={selected ?? ""}
            options={fileOptions}
            onChange={(value) => {
              if (typeof value === "string") setSelected(value || null);
            }}
          />
        </div>
        <div className="min-w-[320px]">
          <CheckboxGroup
            name="levels"
            label={t("Level")}
            value={levels}
            options={levelOptions}
            onChange={(value) => setLevels(value)}
          />
        </div>
        {canManageLogs && (
          <div>
            <Button
              variant="danger"
              size="sm"
              disabled={!selected || loading}
              onClick={handleDelete}
            >
              {t("Delete log")}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
        {entries.length === 0 ? (
          <div className="sf-log-list">
            <p className="sf-log-empty">
              {t("No log entries match the current filter")}
            </p>
          </div>
        ) : (
          <ul className="sf-log-list">
            {entries.map((entry) => (
              <li key={entry._key}>
                <Button
                  type="button"
                  unstyled
                  className="sf-log-row"
                  onClick={() => openEntry(entry)}
                >
                  <div className="sf-log-row__meta">
                    <span
                      className="sf-log-row__meta-mono"
                      title={entry.timestamp}
                    >
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <span
                      className={`sf-status-badge sf-status-badge--${entry.level.toLowerCase()}`}
                    >
                      {entry.level}
                    </span>
                    {entry.target && (
                      <span className="sf-log-row__meta-mono">
                        {entry.target}
                      </span>
                    )}
                  </div>
                  <div className="sf-log-row__message">{entry.message}</div>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

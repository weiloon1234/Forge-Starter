import { useState } from "react";
import { useTranslation } from "react-i18next";
import { observabilityApi } from "@/api";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
  DataTable,
  EmptyState,
  ErrorState,
  JsonViewer,
  KeyValueList,
  MetricCard,
  type ObservabilityColumn,
  RefreshIndicator,
  RightDrawer,
  SectionCard,
} from "@/components/observability";
import { usePollingResource } from "@/hooks/usePollingResource";
import type {
  NPlusOneSuspect,
  SlowQueryEntry,
  SqlObservabilityResponse,
} from "@/observability/types";
import {
  formatDateTime,
  formatDurationMs,
  formatJsonPreview,
  formatNumber,
} from "@/observability/utils";

const SQL_POLL_MS = 15_000;

type SelectedSqlEntry =
  | { type: "slow"; entry: SlowQueryEntry }
  | { type: "suspect"; entry: NPlusOneSuspect };

async function fetchSqlDashboard(): Promise<SqlObservabilityResponse> {
  const response =
    await observabilityApi.get<SqlObservabilityResponse>("/_forge/sql");

  return response.data;
}

function compactList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "—";
}

export function SqlDashboardPage() {
  const { t } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState<SelectedSqlEntry | null>(
    null,
  );

  const { data, loading, refreshing, error, lastUpdated, refresh } =
    usePollingResource(fetchSqlDashboard, {
      intervalMs: selectedEntry ? null : SQL_POLL_MS,
    });

  const slowQueryColumns: ObservabilityColumn<SlowQueryEntry>[] = [
    {
      key: "duration",
      label: t("observability.common.duration"),
      align: "right",
      render: (query) => formatDurationMs(query.duration_ms),
    },
    {
      key: "label",
      label: t("observability.sql.label"),
      render: (query) => query.label ?? "—",
    },
    {
      key: "trace_id",
      label: t("observability.common.trace_id"),
      className: "sf-obs-table__cell--mono",
      render: (query) => query.trace_id ?? query.request_id ?? "—",
    },
    {
      key: "recorded_at",
      label: t("observability.sql.recorded_at"),
      render: (query) => formatDateTime(query.recorded_at),
    },
    {
      key: "sql",
      label: t("observability.sql.query"),
      className: "sf-obs-table__cell--mono sf-obs-table__cell--wide",
      render: (query) => formatJsonPreview(query.sql, 140),
    },
  ];

  const suspectColumns: ObservabilityColumn<NPlusOneSuspect>[] = [
    {
      key: "request",
      label: t("observability.sql.request"),
      render: (suspect) => (
        <div className="sf-obs-table-stack">
          <strong>
            {suspect.method} {suspect.path}
          </strong>
          <span>
            {t("observability.common.request_id")}: {suspect.request_id ?? "—"}
          </span>
          <span>
            {t("observability.common.trace_id")}: {suspect.trace_id ?? "—"}
          </span>
        </div>
      ),
    },
    {
      key: "repeat_count",
      label: t("observability.sql.repeats"),
      align: "right",
      render: (suspect) => formatNumber(suspect.repeat_count),
    },
    {
      key: "total_duration",
      label: t("observability.sql.total_duration"),
      align: "right",
      render: (suspect) => formatDurationMs(suspect.total_duration_ms),
    },
    {
      key: "avg_duration",
      label: t("observability.sql.avg_duration"),
      align: "right",
      render: (suspect) => formatDurationMs(suspect.avg_duration_ms),
    },
    {
      key: "fingerprint",
      label: t("observability.sql.fingerprint"),
      className: "sf-obs-table__cell--mono sf-obs-table__cell--wide",
      render: (suspect) => formatJsonPreview(suspect.fingerprint, 110),
    },
    {
      key: "latest",
      label: t("observability.sql.latest_seen"),
      render: (suspect) => formatDateTime(suspect.latest_recorded_at),
    },
  ];

  if (!data && error) {
    return (
      <div className="sf-obs-page">
        <AdminPageHeader
          title={t("SQL")}
          subtitle={t("observability.sql.subtitle")}
        />
        <ErrorState
          title={t("observability.sql.unavailable")}
          description={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="sf-obs-page">
      <AdminPageHeader
        title={t("SQL")}
        subtitle={t("observability.sql.subtitle")}
        actions={
          <RefreshIndicator
            lastUpdated={lastUpdated}
            refreshing={refreshing || loading}
            paused={Boolean(selectedEntry)}
            onRefresh={refresh}
          />
        }
      />

      <div className="sf-obs-grid sf-obs-grid--metrics">
        <MetricCard
          label={t("observability.sql.retained_slow_queries")}
          value={formatNumber(stats?.retained_count)}
          detail={t("observability.sql.capacity_detail", {
            count: formatNumber(stats?.capacity),
          })}
        />
        <MetricCard
          label={t("observability.sql.slow_threshold")}
          value={formatDurationMs(stats?.slow_query_threshold_ms)}
          detail={t("observability.sql.threshold_detail")}
        />
        <MetricCard
          label={t("observability.sql.max_duration")}
          value={formatDurationMs(stats?.max_duration_ms)}
          detail={t("observability.sql.retained_window")}
          accent={stats?.max_duration_ms ? "warning" : "neutral"}
        />
        <MetricCard
          label={t("observability.sql.avg_duration")}
          value={formatDurationMs(stats?.avg_duration_ms)}
          detail={t("observability.sql.retained_window")}
        />
        <MetricCard
          label={t("observability.sql.latest_slow_query")}
          value={formatDateTime(stats?.latest_recorded_at)}
          detail={t("observability.sql.latest_slow_query_detail")}
        />
        <MetricCard
          label={t("observability.sql.n_plus_one_suspects")}
          value={formatNumber(stats?.n_plus_one_suspect_count)}
          detail={t("observability.sql.http_only_detail")}
          accent={stats?.n_plus_one_suspect_count ? "danger" : "neutral"}
        />
      </div>

      <SectionCard
        title={t("observability.sql.top_slowest")}
        subtitle={t("observability.sql.top_slowest_subtitle")}
      >
        <DataTable
          columns={slowQueryColumns}
          rows={data?.top_slowest ?? []}
          rowKey={(query) =>
            `${query.recorded_at}:${query.duration_ms}:${query.sql}`
          }
          onRowClick={(entry) => setSelectedEntry({ type: "slow", entry })}
          empty={<EmptyState title={t("observability.sql.no_slow_queries")} />}
        />
      </SectionCard>

      <SectionCard
        title={t("observability.sql.n_plus_one_suspects")}
        subtitle={t("observability.sql.n_plus_one_subtitle")}
      >
        <DataTable
          columns={suspectColumns}
          rows={data?.n_plus_one_suspects ?? []}
          rowKey={(suspect) =>
            `${suspect.latest_recorded_at}:${suspect.method}:${suspect.path}:${suspect.fingerprint}`
          }
          onRowClick={(entry) => setSelectedEntry({ type: "suspect", entry })}
          empty={<EmptyState title={t("observability.sql.no_suspects")} />}
        />
      </SectionCard>

      <SectionCard
        title={t("observability.sql.recent_slow_queries")}
        subtitle={t("observability.sql.recent_slow_queries_subtitle")}
      >
        <DataTable
          columns={slowQueryColumns}
          rows={data?.slow_queries ?? []}
          rowKey={(query) => `${query.recorded_at}:${query.sql}`}
          onRowClick={(entry) => setSelectedEntry({ type: "slow", entry })}
          empty={<EmptyState title={t("observability.sql.no_slow_queries")} />}
        />
      </SectionCard>

      <RightDrawer
        open={Boolean(selectedEntry)}
        title={
          selectedEntry?.type === "suspect"
            ? t("observability.sql.suspect_detail")
            : t("observability.sql.slow_query_detail")
        }
        subtitle={
          selectedEntry?.type === "suspect"
            ? `${selectedEntry.entry.method} ${selectedEntry.entry.path}`
            : selectedEntry?.entry.label || undefined
        }
        onClose={() => setSelectedEntry(null)}
      >
        {selectedEntry && (
          <div className="sf-obs-drawer-stack">
            {selectedEntry.type === "suspect" ? (
              <KeyValueList
                items={[
                  {
                    key: "request",
                    label: t("observability.sql.request"),
                    value: `${selectedEntry.entry.method} ${selectedEntry.entry.path}`,
                  },
                  {
                    key: "request_id",
                    label: t("observability.common.request_id"),
                    value: selectedEntry.entry.request_id ?? "—",
                  },
                  {
                    key: "trace_id",
                    label: t("observability.common.trace_id"),
                    value: selectedEntry.entry.trace_id ?? "—",
                  },
                  {
                    key: "repeat_count",
                    label: t("observability.sql.repeats"),
                    value: formatNumber(selectedEntry.entry.repeat_count),
                  },
                  {
                    key: "total_duration",
                    label: t("observability.sql.total_duration"),
                    value: formatDurationMs(
                      selectedEntry.entry.total_duration_ms,
                    ),
                  },
                  {
                    key: "max_duration",
                    label: t("observability.sql.max_duration"),
                    value: formatDurationMs(selectedEntry.entry.max_duration_ms),
                  },
                  {
                    key: "avg_duration",
                    label: t("observability.sql.avg_duration"),
                    value: formatDurationMs(selectedEntry.entry.avg_duration_ms),
                  },
                  {
                    key: "rows_total",
                    label: t("observability.sql.rows_total"),
                    value: formatNumber(selectedEntry.entry.rows_total),
                  },
                  {
                    key: "labels",
                    label: t("observability.sql.labels"),
                    value: compactList(selectedEntry.entry.labels),
                  },
                  {
                    key: "kinds",
                    label: t("observability.sql.kinds"),
                    value: compactList(selectedEntry.entry.kinds),
                  },
                  {
                    key: "first_seen",
                    label: t("observability.sql.first_seen"),
                    value: formatDateTime(selectedEntry.entry.first_recorded_at),
                  },
                  {
                    key: "latest_seen",
                    label: t("observability.sql.latest_seen"),
                    value: formatDateTime(
                      selectedEntry.entry.latest_recorded_at,
                    ),
                  },
                ]}
              />
            ) : (
              <KeyValueList
                items={[
                  {
                    key: "duration",
                    label: t("observability.common.duration"),
                    value: formatDurationMs(selectedEntry.entry.duration_ms),
                  },
                  {
                    key: "label",
                    label: t("observability.sql.label"),
                    value: selectedEntry.entry.label ?? "—",
                  },
                  {
                    key: "request_id",
                    label: t("observability.common.request_id"),
                    value: selectedEntry.entry.request_id ?? "—",
                  },
                  {
                    key: "trace_id",
                    label: t("observability.common.trace_id"),
                    value: selectedEntry.entry.trace_id ?? "—",
                  },
                  {
                    key: "recorded_at",
                    label: t("observability.sql.recorded_at"),
                    value: formatDateTime(selectedEntry.entry.recorded_at),
                  },
                ]}
              />
            )}

            <div className="sf-obs-drawer-section">
              <h3>{t("observability.sql.query")}</h3>
              <pre className="sf-obs-json-viewer">
                {selectedEntry.type === "suspect"
                  ? selectedEntry.entry.sample_sql
                  : selectedEntry.entry.sql}
              </pre>
            </div>

            {selectedEntry.type === "suspect" && (
              <div className="sf-obs-drawer-section">
                <h3>{t("observability.sql.fingerprint")}</h3>
                <pre className="sf-obs-json-viewer">
                  {selectedEntry.entry.fingerprint}
                </pre>
              </div>
            )}

            <div className="sf-obs-drawer-section">
              <h3>{t("observability.common.raw_json")}</h3>
              <JsonViewer value={selectedEntry.entry} />
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

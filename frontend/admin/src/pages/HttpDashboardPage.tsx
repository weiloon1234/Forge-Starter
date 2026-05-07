import { useMemo, useState } from "react";
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
  StatusBadge,
} from "@/components/observability";
import { usePollingResource } from "@/hooks/usePollingResource";
import type {
  HealthResponse,
  HttpRequestSample,
  HttpRouteRanking,
  HttpStatsResponse,
  ReadinessResponse,
  RuntimeResponse,
} from "@/observability/types";
import {
  bucketRowsFromCumulative,
  computeHistogramQuantile,
  formatDateTime,
  formatDurationMs,
  formatJsonPreview,
  formatLatencyMs,
  formatNumber,
} from "@/observability/utils";

const HTTP_POLL_MS = 10_000;

type HttpDashboardData = {
  health: HealthResponse;
  ready: ReadinessResponse;
  runtime: RuntimeResponse;
  httpStats: HttpStatsResponse;
};

async function fetchHttpDashboard(): Promise<HttpDashboardData> {
  const [health, ready, runtime, httpStats] = await Promise.all([
    observabilityApi.get<HealthResponse>("/_forge/health"),
    observabilityApi.get<ReadinessResponse>("/_forge/ready"),
    observabilityApi.get<RuntimeResponse>("/_forge/runtime"),
    observabilityApi.get<HttpStatsResponse>("/_forge/http/stats"),
  ]);

  return {
    health: health.data,
    ready: ready.data,
    runtime: runtime.data,
    httpStats: httpStats.data,
  };
}

type SelectedHttpSample = {
  type: "slow" | "error";
  entry: HttpRequestSample;
};

function httpStatusTone(status: number) {
  if (status >= 500) return "danger" as const;
  if (status >= 400) return "warning" as const;
  if (status >= 200 && status < 300) return "success" as const;
  return "neutral" as const;
}

function routeErrorCount(route: HttpRouteRanking) {
  return route.client_error_total + route.server_error_total;
}

export function HttpDashboardPage() {
  const { t } = useTranslation();
  const [selectedSample, setSelectedSample] = useState<SelectedHttpSample | null>(
    null,
  );

  const { data, loading, refreshing, error, lastUpdated, refresh } =
    usePollingResource(fetchHttpDashboard, {
      intervalMs: selectedSample ? null : HTTP_POLL_MS,
    });

  const http = data?.runtime.http;
  const httpStats = data?.httpStats;
  const histogram = http?.duration_ms;
  const totalRequests = http?.requests_total ?? 0;

  const p50 = useMemo(
    () => computeHistogramQuantile(histogram, 0.5),
    [histogram],
  );
  const p95 = useMemo(
    () => computeHistogramQuantile(histogram, 0.95),
    [histogram],
  );
  const p99 = useMemo(
    () => computeHistogramQuantile(histogram, 0.99),
    [histogram],
  );

  const averageMs = useMemo(() => {
    if (!histogram || histogram.count === 0) return null;
    return histogram.sum_ms / histogram.count;
  }, [histogram]);

  const bucketRows = useMemo(
    () =>
      histogram
        ? bucketRowsFromCumulative(histogram.buckets, histogram.count)
        : [],
    [histogram],
  );

  const successRate = useMemo(() => {
    if (!http || http.requests_total === 0) return "—";
    const ratio = (http.success_total / http.requests_total) * 100;
    return `${ratio.toFixed(1)}%`;
  }, [http]);

  const errorRate = useMemo(() => {
    if (!http || http.requests_total === 0) return "—";
    const errors = http.client_error_total + http.server_error_total;
    const ratio = (errors / http.requests_total) * 100;
    return `${ratio.toFixed(1)}%`;
  }, [http]);

  const routeColumns: ObservabilityColumn<HttpRouteRanking>[] = [
    {
      key: "route",
      label: t("observability.http.route"),
      render: (route) => (
        <div className="sf-obs-table-stack">
          <strong>
            {route.method} {route.path}
          </strong>
          <span>
            {t("observability.http.latest_seen")}:{" "}
            {formatDateTime(route.latest_recorded_at)}
          </span>
        </div>
      ),
    },
    {
      key: "requests",
      label: t("observability.http.requests"),
      align: "right",
      render: (route) => formatNumber(route.requests_total),
    },
    {
      key: "avg",
      label: t("observability.http.avg_latency"),
      align: "right",
      render: (route) => formatDurationMs(route.avg_duration_ms),
    },
    {
      key: "max",
      label: t("observability.http.max_latency"),
      align: "right",
      render: (route) => formatDurationMs(route.max_duration_ms),
    },
    {
      key: "p95",
      label: t("observability.http.p95"),
      align: "right",
      render: (route) => formatDurationMs(route.p95_duration_ms),
    },
    {
      key: "p99",
      label: t("observability.http.p99"),
      align: "right",
      render: (route) => formatDurationMs(route.p99_duration_ms),
    },
    {
      key: "errors",
      label: t("observability.http.errors"),
      align: "right",
      render: (route) => (
        <span>
          {formatNumber(routeErrorCount(route))}
          <span className="sf-obs-muted">
            {" "}
            ({formatNumber(route.client_error_total)} /{" "}
            {formatNumber(route.server_error_total)})
          </span>
        </span>
      ),
    },
  ];

  const sampleColumns: ObservabilityColumn<HttpRequestSample>[] = [
    {
      key: "status",
      label: t("observability.common.status"),
      render: (sample) => (
        <StatusBadge tone={httpStatusTone(sample.status)}>
          {sample.status}
        </StatusBadge>
      ),
    },
    {
      key: "request",
      label: t("observability.http.request"),
      render: (sample) => (
        <div className="sf-obs-table-stack">
          <strong>
            {sample.method} {sample.path}
          </strong>
          <span>
            {t("observability.common.request_id")}: {sample.request_id ?? "—"}
          </span>
        </div>
      ),
    },
    {
      key: "duration",
      label: t("observability.common.duration"),
      align: "right",
      render: (sample) => formatDurationMs(sample.duration_ms),
    },
    {
      key: "trace",
      label: t("observability.common.trace_id"),
      className: "sf-obs-table__cell--mono",
      render: (sample) => sample.trace_id ?? "—",
    },
    {
      key: "recorded_at",
      label: t("observability.http.recorded_at"),
      render: (sample) => formatDateTime(sample.recorded_at),
    },
  ];

  if (!data && error) {
    return (
      <div className="sf-obs-page">
        <AdminPageHeader
          title={t("HTTP")}
          subtitle={t("observability.http.subtitle")}
        />
        <ErrorState
          title={t("observability.http.unavailable")}
          description={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="sf-obs-page">
      <AdminPageHeader
        title={t("HTTP")}
        subtitle={t("observability.http.subtitle")}
        actions={
          <RefreshIndicator
            lastUpdated={lastUpdated}
            refreshing={refreshing || loading}
            paused={Boolean(selectedSample)}
            onRefresh={refresh}
          />
        }
      />

      <div className="sf-obs-grid sf-obs-grid--metrics">
        <MetricCard
          label={t("observability.http.requests_total")}
          value={formatNumber(http?.requests_total)}
          detail={t("observability.http.cumulative_total")}
        />
        <MetricCard
          label={t("observability.http.success_rate")}
          value={successRate}
          detail={t("observability.http.status_totals", {
            success: formatNumber(http?.success_total),
            total: formatNumber(http?.requests_total),
          })}
          accent="success"
        />
        <MetricCard
          label={t("observability.http.error_rate")}
          value={errorRate}
          detail={t("observability.http.client_server_errors", {
            client: formatNumber(http?.client_error_total),
            server: formatNumber(http?.server_error_total),
          })}
          accent={
            http && http.server_error_total > 0
              ? "danger"
              : http && http.client_error_total > 0
                ? "warning"
                : "neutral"
          }
        />
        <MetricCard
          label={t("observability.http.avg_latency")}
          value={formatLatencyMs(averageMs)}
          detail={t("observability.http.sampled_over", {
            count: formatNumber(histogram?.count ?? 0),
          })}
        />
        <MetricCard
          label={t("observability.http.p50")}
          value={formatLatencyMs(p50)}
          detail={t("observability.http.interpolated_from_buckets")}
        />
        <MetricCard
          label={t("observability.http.p95")}
          value={formatLatencyMs(p95)}
          detail={t("observability.http.interpolated_from_buckets")}
        />
        <MetricCard
          label={t("observability.http.p99")}
          value={formatLatencyMs(p99)}
          detail={t("observability.http.interpolated_from_buckets")}
        />
        <MetricCard
          label={t("observability.http.retained_samples")}
          value={formatNumber(httpStats?.stats.retained_request_count)}
          detail={t("observability.http.retention_detail", {
            count: formatNumber(httpStats?.stats.retention_capacity),
          })}
        />
        <MetricCard
          label={t("observability.http.ranked_routes")}
          value={formatNumber(httpStats?.stats.route_count)}
          detail={t("observability.common.node_local_note")}
        />
        <MetricCard
          label={t("observability.http.slow_samples")}
          value={formatNumber(httpStats?.stats.slow_request_count)}
          detail={t("observability.http.slow_threshold_detail", {
            value: formatDurationMs(httpStats?.stats.slow_request_threshold_ms),
          })}
          accent={httpStats?.stats.slow_request_count ? "warning" : "neutral"}
        />
        <MetricCard
          label={t("observability.http.error_samples")}
          value={formatNumber(httpStats?.stats.error_request_count)}
          detail={t("observability.http.retained_window")}
          accent={httpStats?.stats.error_request_count ? "danger" : "neutral"}
        />
      </div>

      <div className="sf-obs-grid sf-obs-grid--dual">
        <SectionCard
          title={t("observability.http.status_breakdown")}
          subtitle={t("observability.http.status_breakdown_subtitle", {
            total: formatNumber(totalRequests),
          })}
        >
          <div className="sf-obs-breakdown">
            {!http || http.requests_total === 0 ? (
              <EmptyState title={t("observability.http.no_traffic")} />
            ) : (
              <div className="sf-obs-breakdown__list">
                {[
                  {
                    key: "informational",
                    label: t("observability.http.class_informational"),
                    count: http.informational_total,
                    tone: "neutral" as const,
                  },
                  {
                    key: "success",
                    label: t("observability.http.class_success"),
                    count: http.success_total,
                    tone: "success" as const,
                  },
                  {
                    key: "redirection",
                    label: t("observability.http.class_redirection"),
                    count: http.redirection_total,
                    tone: "neutral" as const,
                  },
                  {
                    key: "client_error",
                    label: t("observability.http.class_client_error"),
                    count: http.client_error_total,
                    tone: "warning" as const,
                  },
                  {
                    key: "server_error",
                    label: t("observability.http.class_server_error"),
                    count: http.server_error_total,
                    tone: "danger" as const,
                  },
                ]
                  .filter((row) => row.count > 0)
                  .map((row) => {
                    const width =
                      http.requests_total > 0
                        ? (row.count / http.requests_total) * 100
                        : 0;
                    return (
                      <div key={row.key} className="sf-obs-breakdown__row">
                        <div className="sf-obs-breakdown__label">
                          <span>{row.label}</span>
                          <span>{formatNumber(row.count)}</span>
                        </div>
                        <div className="sf-obs-breakdown__bar">
                          <span
                            className={`sf-obs-breakdown__fill sf-obs-breakdown__fill--${row.tone}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={t("observability.http.bucket_breakdown")}
          subtitle={t("observability.http.bucket_breakdown_subtitle", {
            count: formatNumber(histogram?.count ?? 0),
          })}
        >
          <div className="sf-obs-breakdown">
            {bucketRows.length === 0 ? (
              <EmptyState title={t("observability.http.no_traffic")} />
            ) : (
              <div className="sf-obs-breakdown__list">
                {bucketRows.map((row) => (
                  <div key={row.label} className="sf-obs-breakdown__row">
                    <div className="sf-obs-breakdown__label">
                      <span>{row.label}</span>
                      <span>{formatNumber(row.count)}</span>
                    </div>
                    <div className="sf-obs-breakdown__bar">
                      <span
                        className={`sf-obs-breakdown__fill sf-obs-breakdown__fill--${
                          row.overflow ? "danger" : "neutral"
                        }`}
                        style={{ width: `${row.share * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={t("observability.http.top_slowest_routes")}
        subtitle={t("observability.http.top_slowest_routes_subtitle")}
      >
        <DataTable
          columns={routeColumns}
          rows={httpStats?.top_slowest_routes ?? []}
          rowKey={(route) => `${route.method}:${route.path}`}
          empty={<EmptyState title={t("observability.http.no_routes")} />}
        />
      </SectionCard>

      <SectionCard
        title={t("observability.http.top_error_routes")}
        subtitle={t("observability.http.top_error_routes_subtitle")}
      >
        <DataTable
          columns={routeColumns}
          rows={httpStats?.top_error_routes ?? []}
          rowKey={(route) => `${route.method}:${route.path}`}
          empty={<EmptyState title={t("observability.http.no_error_routes")} />}
        />
      </SectionCard>

      <div className="sf-obs-grid sf-obs-grid--dual">
        <SectionCard
          title={t("observability.http.recent_slow_requests")}
          subtitle={t("observability.http.recent_slow_requests_subtitle")}
        >
          <DataTable
            columns={sampleColumns}
            rows={httpStats?.recent_slow_requests ?? []}
            rowKey={(sample) =>
              `${sample.recorded_at}:${sample.method}:${sample.path}:${sample.status}:${sample.duration_ms}`
            }
            onRowClick={(entry) =>
              setSelectedSample({ type: "slow", entry })
            }
            empty={<EmptyState title={t("observability.http.no_slow_samples")} />}
          />
        </SectionCard>

        <SectionCard
          title={t("observability.http.recent_error_requests")}
          subtitle={t("observability.http.recent_error_requests_subtitle")}
        >
          <DataTable
            columns={sampleColumns}
            rows={httpStats?.recent_error_requests ?? []}
            rowKey={(sample) =>
              `${sample.recorded_at}:${sample.method}:${sample.path}:${sample.status}:${sample.duration_ms}`
            }
            onRowClick={(entry) =>
              setSelectedSample({ type: "error", entry })
            }
            empty={
              <EmptyState title={t("observability.http.no_error_samples")} />
            }
          />
        </SectionCard>
      </div>

      <div className="sf-obs-footer-strip">
        <div>
          <span>{t("observability.common.backend")}</span>
          <strong>{data?.runtime.backend ?? "—"}</strong>
        </div>
        <div>
          <span>{t("observability.common.bootstrap_complete")}</span>
          <strong>
            {data?.runtime.bootstrap_complete
              ? t("observability.common.complete")
              : t("observability.common.pending")}
          </strong>
        </div>
      </div>

      <RightDrawer
        open={Boolean(selectedSample)}
        title={
          selectedSample?.type === "slow"
            ? t("observability.http.slow_request_detail")
            : t("observability.http.error_request_detail")
        }
        subtitle={
          selectedSample
            ? `${selectedSample.entry.method} ${selectedSample.entry.path}`
            : undefined
        }
        onClose={() => setSelectedSample(null)}
      >
        {selectedSample && (
          <div className="sf-obs-drawer-stack">
            <KeyValueList
              items={[
                {
                  key: "status",
                  label: t("observability.common.status"),
                  value: (
                    <StatusBadge tone={httpStatusTone(selectedSample.entry.status)}>
                      {selectedSample.entry.status}
                    </StatusBadge>
                  ),
                },
                {
                  key: "duration",
                  label: t("observability.common.duration"),
                  value: formatDurationMs(selectedSample.entry.duration_ms),
                },
                {
                  key: "request_id",
                  label: t("observability.common.request_id"),
                  value: selectedSample.entry.request_id ?? "—",
                },
                {
                  key: "trace_id",
                  label: t("observability.common.trace_id"),
                  value: selectedSample.entry.trace_id ?? "—",
                },
                {
                  key: "recorded_at",
                  label: t("observability.http.recorded_at"),
                  value: formatDateTime(selectedSample.entry.recorded_at),
                },
              ]}
            />

            <div className="sf-obs-drawer-section">
              <h3>{t("observability.http.request")}</h3>
              <pre className="sf-obs-json-viewer">
                {formatJsonPreview(
                  `${selectedSample.entry.method} ${selectedSample.entry.path}`,
                  500,
                )}
              </pre>
            </div>

            <div className="sf-obs-drawer-section">
              <h3>{t("observability.common.raw_json")}</h3>
              <JsonViewer value={selectedSample.entry} />
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

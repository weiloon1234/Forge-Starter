import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { observabilityApi } from "@/api";
import {
  EmptyState,
  ErrorState,
  MetricCard,
  RefreshIndicator,
  SectionCard,
} from "@/components/observability";
import { usePollingResource } from "@/hooks/usePollingResource";
import type {
  HealthResponse,
  ReadinessResponse,
  RuntimeResponse,
} from "@/observability/types";
import {
  bucketRowsFromCumulative,
  computeHistogramQuantile,
  formatLatencyMs,
  formatNumber,
} from "@/observability/utils";

const HTTP_POLL_MS = 10_000;

type HttpDashboardData = {
  health: HealthResponse;
  ready: ReadinessResponse;
  runtime: RuntimeResponse;
};

async function fetchHttpDashboard(): Promise<HttpDashboardData> {
  const [health, ready, runtime] = await Promise.all([
    observabilityApi.get<HealthResponse>("/_forge/health"),
    observabilityApi.get<ReadinessResponse>("/_forge/ready"),
    observabilityApi.get<RuntimeResponse>("/_forge/runtime"),
  ]);

  return {
    health: health.data,
    ready: ready.data,
    runtime: runtime.data,
  };
}

export function HttpDashboardPage() {
  const { t } = useTranslation();

  const { data, loading, refreshing, error, lastUpdated, refresh } =
    usePollingResource(fetchHttpDashboard, { intervalMs: HTTP_POLL_MS });

  const http = data?.runtime.http;
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

  if (!data && error) {
    return (
      <div className="sf-obs-page">
        <div className="sf-page-header">
          <div>
            <h1 className="sf-page-title">{t("HTTP")}</h1>
            <p className="sf-page-subtitle">
              {t("observability.http.subtitle")}
            </p>
          </div>
        </div>
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
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{t("HTTP")}</h1>
          <p className="sf-page-subtitle">{t("observability.http.subtitle")}</p>
        </div>
        <RefreshIndicator
          lastUpdated={lastUpdated}
          refreshing={refreshing || loading}
          onRefresh={refresh}
        />
      </div>

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
    </div>
  );
}

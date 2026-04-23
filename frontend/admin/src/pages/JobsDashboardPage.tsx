import { Button } from "@shared/components";
import { ArrowDownUp } from "lucide-react";
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
  FailedJobEntry,
  HealthResponse,
  JobsFailedResponse,
  JobsStatsResponse,
  ReadinessResponse,
  RuntimeResponse,
} from "@/observability/types";
import {
  failedJobSortValue,
  formatDateTime,
  formatDurationMs,
  formatNumber,
  sortJobStats,
  statusToneForJob,
} from "@/observability/utils";

const JOBS_POLL_MS = 10_000;
const FAILED_JOBS_LIMIT = 50;

type JobsDashboardData = {
  health: HealthResponse;
  ready: ReadinessResponse;
  runtime: RuntimeResponse;
  stats: JobsStatsResponse;
  failed: JobsFailedResponse;
};

type SortKey =
  | "job_id"
  | "queue"
  | "status"
  | "attempt"
  | "duration_ms"
  | "created_at";
type SortDirection = "asc" | "desc";

async function fetchJobsDashboard(): Promise<JobsDashboardData> {
  const [health, ready, runtime, stats, failed] = await Promise.all([
    observabilityApi.get<HealthResponse>("/_forge/health"),
    observabilityApi.get<ReadinessResponse>("/_forge/ready"),
    observabilityApi.get<RuntimeResponse>("/_forge/runtime"),
    observabilityApi.get<JobsStatsResponse>("/_forge/jobs/stats"),
    observabilityApi.get<JobsFailedResponse>("/_forge/jobs/failed"),
  ]);

  return {
    health: health.data,
    ready: ready.data,
    runtime: runtime.data,
    stats: stats.data,
    failed: failed.data,
  };
}

function sortJobs(
  jobs: FailedJobEntry[],
  sortKey: SortKey,
  direction: SortDirection,
) {
  return [...jobs].sort((left, right) => {
    const leftValue = failedJobSortValue(left, sortKey);
    const rightValue = failedJobSortValue(right, sortKey);

    if (leftValue < rightValue) {
      return direction === "asc" ? -1 : 1;
    }
    if (leftValue > rightValue) {
      return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

export function JobsDashboardPage() {
  const { t } = useTranslation();
  const [selectedJob, setSelectedJob] = useState<FailedJobEntry | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data, loading, refreshing, error, lastUpdated, refresh } =
    usePollingResource(fetchJobsDashboard, {
      intervalMs: selectedJob ? null : JOBS_POLL_MS,
    });

  const orderedStats = useMemo(
    () => sortJobStats(data?.stats.stats ?? []),
    [data?.stats.stats],
  );
  const sortedFailedJobs = useMemo(
    () => sortJobs(data?.failed.failed_jobs ?? [], sortKey, sortDirection),
    [data?.failed.failed_jobs, sortDirection, sortKey],
  );

  const totalStatusCount = orderedStats.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const runtime = data?.runtime;
  const health = data?.health;
  const readiness = data?.ready;
  const readinessIssues =
    readiness?.probes.filter(
      (probe) => probe.state !== "healthy" && probe.message,
    ) ?? [];

  const successRate =
    runtime && runtime.jobs.started_total > 0
      ? `${((runtime.jobs.succeeded_total / runtime.jobs.started_total) * 100).toFixed(1)}%`
      : "—";
  const failurePressure = runtime
    ? runtime.jobs.retried_total + runtime.jobs.dead_lettered_total
    : 0;

  const toggleSort = (nextSortKey: SortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "created_at" ? "desc" : "asc");
  };

  const renderSortLabel = (label: string, nextSortKey: SortKey) => (
    <Button
      type="button"
      unstyled
      className="sf-obs-sort-button"
      onClick={() => toggleSort(nextSortKey)}
    >
      <span>{label}</span>
      <ArrowDownUp size={14} />
    </Button>
  );

  const failureColumns: ObservabilityColumn<FailedJobEntry>[] = [
    {
      key: "job_id",
      label: renderSortLabel(t("observability.common.job_id"), "job_id"),
      className: "sf-obs-table__cell--mono",
      render: (job) => job.job_id,
    },
    {
      key: "queue",
      label: renderSortLabel(t("observability.common.queue"), "queue"),
      render: (job) => job.queue,
    },
    {
      key: "status",
      label: renderSortLabel(t("observability.common.status"), "status"),
      render: (job) => (
        <StatusBadge tone={statusToneForJob(job.status)}>
          {t(`observability.job_status.${job.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: "attempt",
      label: renderSortLabel(t("observability.common.attempt"), "attempt"),
      align: "right",
      render: (job) => formatNumber(job.attempt ?? 0),
    },
    {
      key: "duration_ms",
      label: renderSortLabel(t("observability.common.duration"), "duration_ms"),
      align: "right",
      render: (job) => formatDurationMs(job.duration_ms),
    },
    {
      key: "created_at",
      label: renderSortLabel(
        t("observability.common.created_at"),
        "created_at",
      ),
      render: (job) => formatDateTime(job.created_at),
    },
  ];

  if (!data && error) {
    return (
      <div className="sf-obs-page">
        <AdminPageHeader
          title={t("Jobs")}
          subtitle={t("observability.jobs.subtitle")}
        />
        <ErrorState
          title={t("observability.jobs.unavailable")}
          description={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="sf-obs-page">
      <AdminPageHeader
        title={t("Jobs")}
        subtitle={t("observability.jobs.subtitle")}
        actions={
          <RefreshIndicator
            lastUpdated={lastUpdated}
            refreshing={refreshing || loading}
            paused={Boolean(selectedJob)}
            onRefresh={refresh}
          />
        }
      />

      <div className="sf-obs-grid sf-obs-grid--metrics">
        <section className="sf-obs-health-card">
          <div className="sf-obs-health-card__header">
            <p className="sf-obs-metric-card__label">
              {t("observability.jobs.runtime_health")}
            </p>
          </div>
          <div className="sf-obs-health-card__status">
            <StatusBadge
              tone={health?.state === "healthy" ? "success" : "danger"}
            >
              {health?.state === "healthy"
                ? t("observability.jobs.healthy")
                : t("observability.jobs.unhealthy")}
            </StatusBadge>
            <StatusBadge
              tone={readiness?.state === "healthy" ? "success" : "warning"}
            >
              {readiness?.state === "healthy"
                ? t("observability.jobs.ready")
                : t("observability.jobs.degraded")}
            </StatusBadge>
          </div>
          <p className="sf-obs-metric-card__detail">
            {readinessIssues.length > 0
              ? t("observability.jobs.readiness_issues", {
                  count: readinessIssues.length,
                })
              : t("observability.jobs.no_readiness_issues")}
          </p>
          {readinessIssues.length > 0 && (
            <ul className="sf-obs-health-card__issues">
              {readinessIssues.map((probe) => (
                <li key={probe.id}>
                  {probe.id}: {probe.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <MetricCard
          label={t("observability.jobs.jobs_enqueued")}
          value={formatNumber(runtime?.jobs.enqueued_total)}
          detail={t("observability.jobs.cumulative_total")}
        />
        <MetricCard
          label={t("observability.jobs.jobs_started")}
          value={formatNumber(runtime?.jobs.started_total)}
          detail={t("observability.jobs.cumulative_total")}
        />
        <MetricCard
          label={t("observability.jobs.jobs_succeeded")}
          value={formatNumber(runtime?.jobs.succeeded_total)}
          detail={t("observability.jobs.success_rate", { value: successRate })}
          accent="success"
        />
        <MetricCard
          label={t("observability.jobs.jobs_retried")}
          value={formatNumber(runtime?.jobs.retried_total)}
          detail={t("observability.jobs.status_total", {
            value: formatNumber(
              orderedStats.find((item) => item.status === "retried")?.count ??
                0,
            ),
          })}
          accent="warning"
        />
        <MetricCard
          label={t("observability.jobs.jobs_dead_lettered")}
          value={formatNumber(runtime?.jobs.dead_lettered_total)}
          detail={t("observability.jobs.failure_pressure", {
            value: formatNumber(failurePressure),
          })}
          accent={
            runtime && runtime.jobs.dead_lettered_total > 0
              ? "danger"
              : "neutral"
          }
        />
        <MetricCard
          label={t("observability.jobs.expired_lease_requeues")}
          value={formatNumber(runtime?.jobs.expired_requeues_total)}
          detail={t("observability.jobs.cumulative_total")}
        />
        <MetricCard
          label={t("observability.jobs.scheduler_leader")}
          value={
            runtime?.scheduler.leader_active
              ? t("observability.jobs.leader")
              : t("observability.jobs.follower")
          }
          detail={t("observability.jobs.executed_ticks", {
            executed: formatNumber(runtime?.scheduler.executed_schedules_total),
            ticks: formatNumber(runtime?.scheduler.ticks_total),
          })}
          accent={runtime?.scheduler.leader_active ? "success" : "neutral"}
        />
      </div>

      <div className="sf-obs-grid sf-obs-grid--dual">
        <SectionCard
          title={t("observability.jobs.status_breakdown")}
          subtitle={t("observability.jobs.status_breakdown_subtitle", {
            count: formatNumber(totalStatusCount),
          })}
        >
          <div className="sf-obs-breakdown">
            {orderedStats.length === 0 ? (
              <EmptyState title={t("No data")} />
            ) : (
              <div className="sf-obs-breakdown__list">
                {orderedStats.map((item) => {
                  const width =
                    totalStatusCount > 0
                      ? (item.count / totalStatusCount) * 100
                      : 0;

                  return (
                    <div key={item.status} className="sf-obs-breakdown__row">
                      <div className="sf-obs-breakdown__label">
                        <StatusBadge tone={statusToneForJob(item.status)}>
                          {t(`observability.job_status.${item.status}`)}
                        </StatusBadge>
                        <span>{formatNumber(item.count)}</span>
                      </div>
                      <div className="sf-obs-breakdown__bar">
                        <span
                          className={`sf-obs-breakdown__fill sf-obs-breakdown__fill--${statusToneForJob(
                            item.status,
                          )}`}
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
          title={t("observability.jobs.scheduler_activity")}
          subtitle={t("observability.jobs.scheduler_activity_subtitle")}
        >
          <KeyValueList
            items={[
              {
                key: "leader",
                label: t("observability.jobs.scheduler_leader"),
                value: (
                  <StatusBadge
                    tone={
                      runtime?.scheduler.leader_active ? "success" : "neutral"
                    }
                  >
                    {runtime?.scheduler.leader_active
                      ? t("observability.jobs.leader")
                      : t("observability.jobs.follower")}
                  </StatusBadge>
                ),
              },
              {
                key: "executed",
                label: t("observability.jobs.executed_schedules"),
                value: formatNumber(
                  runtime?.scheduler.executed_schedules_total,
                ),
              },
              {
                key: "ticks",
                label: t("observability.jobs.ticks_total"),
                value: formatNumber(runtime?.scheduler.ticks_total),
              },
              {
                key: "acquired",
                label: t("observability.jobs.leadership_acquired"),
                value: formatNumber(
                  runtime?.scheduler.leadership_acquired_total,
                ),
              },
              {
                key: "lost",
                label: t("observability.jobs.leadership_lost"),
                value: formatNumber(runtime?.scheduler.leadership_lost_total),
              },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard
        title={t("observability.jobs.recent_failures")}
        subtitle={t("observability.common.latest_50_note", {
          count: FAILED_JOBS_LIMIT,
        })}
      >
        <DataTable
          columns={failureColumns}
          rows={sortedFailedJobs}
          rowKey={(job) => `${job.job_id}:${job.created_at ?? ""}:${job.queue}`}
          onRowClick={setSelectedJob}
          empty={<EmptyState title={t("observability.jobs.no_failed_jobs")} />}
        />
      </SectionCard>

      <div className="sf-obs-footer-strip">
        <div>
          <span>{t("observability.common.backend")}</span>
          <strong>{runtime?.backend ?? "—"}</strong>
        </div>
        <div>
          <span>{t("observability.common.bootstrap_complete")}</span>
          <strong>
            {runtime?.bootstrap_complete
              ? t("observability.common.complete")
              : t("observability.common.pending")}
          </strong>
        </div>
      </div>

      <RightDrawer
        open={Boolean(selectedJob)}
        title={selectedJob?.job_id ?? t("observability.jobs.details")}
        subtitle={selectedJob?.queue}
        onClose={() => setSelectedJob(null)}
      >
        {selectedJob && (
          <div className="sf-obs-drawer-stack">
            <KeyValueList
              items={[
                {
                  key: "status",
                  label: t("observability.common.status"),
                  value: (
                    <StatusBadge tone={statusToneForJob(selectedJob.status)}>
                      {t(`observability.job_status.${selectedJob.status}`)}
                    </StatusBadge>
                  ),
                },
                {
                  key: "attempt",
                  label: t("observability.common.attempt"),
                  value: formatNumber(selectedJob.attempt ?? 0),
                },
                {
                  key: "duration",
                  label: t("observability.common.duration"),
                  value: formatDurationMs(selectedJob.duration_ms),
                },
                {
                  key: "created_at",
                  label: t("observability.common.created_at"),
                  value: formatDateTime(selectedJob.created_at),
                },
                {
                  key: "started_at",
                  label: t("observability.common.started_at"),
                  value: formatDateTime(selectedJob.started_at),
                },
                {
                  key: "completed_at",
                  label: t("observability.common.completed_at"),
                  value: formatDateTime(selectedJob.completed_at),
                },
              ]}
            />

            <div className="sf-obs-drawer-section">
              <h3>{t("observability.common.error")}</h3>
              <pre className="sf-obs-json-viewer">
                {selectedJob.error || t("observability.common.not_available")}
              </pre>
            </div>

            <div className="sf-obs-drawer-section">
              <h3>{t("observability.common.raw_json")}</h3>
              <JsonViewer value={selectedJob} />
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

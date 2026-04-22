import {
  formatDateTime as formatSharedDateTime,
  parseDateTimeValue,
} from "@shared/utils";
import axios from "axios";
import type {
  FailedJobEntry,
  HttpDurationBucketSnapshot,
  HttpDurationHistogramSnapshot,
  MergedWebSocketChannel,
  WebSocketChannelConfig,
  WebSocketChannelStats,
} from "@/observability/types";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const numberFormatter = new Intl.NumberFormat();

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0);
}

export function formatDurationMs(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

export function formatLatencyMs(value: number | null | undefined) {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "> 30 s";
  if (value < 1) return "< 1 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

// Prometheus-style histogram_quantile over cumulative buckets.
// Returns null when the histogram has no samples OR the target quantile lands
// in the implicit +Inf bucket (i.e., beyond the highest finite upper bound).
export function computeHistogramQuantile(
  histogram: HttpDurationHistogramSnapshot | undefined,
  quantile: number,
): number | null {
  if (!histogram || histogram.count === 0) return null;

  const target = histogram.count * quantile;
  let prevLe = 0;
  let prevCum = 0;

  for (const bucket of histogram.buckets) {
    if (bucket.cumulative_count >= target) {
      const bucketCount = bucket.cumulative_count - prevCum;
      if (bucketCount === 0) return bucket.le_ms;
      const fraction = (target - prevCum) / bucketCount;
      return prevLe + fraction * (bucket.le_ms - prevLe);
    }
    prevLe = bucket.le_ms;
    prevCum = bucket.cumulative_count;
  }

  // Target beyond all finite buckets — the implicit +Inf bucket has samples
  // but no upper bound. Callers render this as "> {last_le_ms} ms".
  return null;
}

export interface HttpLatencyBucketRow {
  le_ms: number;
  // non-cumulative count within this bucket
  count: number;
  // 0..1, share of total samples (including the +Inf overflow)
  share: number;
  // e.g., "≤ 25 ms", "250–500 ms", "> 30 s"
  label: string;
  overflow: boolean;
}

export function bucketRowsFromCumulative(
  buckets: HttpDurationBucketSnapshot[],
  total: number,
): HttpLatencyBucketRow[] {
  if (total === 0) return [];

  const rows: HttpLatencyBucketRow[] = [];
  let prevLe = 0;
  let prevCum = 0;

  for (const bucket of buckets) {
    const count = bucket.cumulative_count - prevCum;
    const label =
      prevLe === 0 ? `≤ ${bucket.le_ms} ms` : `${prevLe}–${bucket.le_ms} ms`;
    rows.push({
      le_ms: bucket.le_ms,
      count,
      share: total > 0 ? count / total : 0,
      label,
      overflow: false,
    });
    prevLe = bucket.le_ms;
    prevCum = bucket.cumulative_count;
  }

  const overflowCount = total - prevCum;
  if (overflowCount > 0) {
    rows.push({
      le_ms: Number.POSITIVE_INFINITY,
      count: overflowCount,
      share: total > 0 ? overflowCount / total : 0,
      label: `> ${prevLe} ms`,
      overflow: true,
    });
  }

  return rows;
}

export function formatDateTime(value: string | number | null | undefined) {
  return formatSharedDateTime(value, { includeSeconds: true });
}

export function formatJsonPreview(value: unknown, maxLength = 120) {
  const source =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");

  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength).trimEnd()}…`;
}

export function extractApiMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    return data?.message ?? data?.error ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong";
}

export const JOB_STATUS_ORDER = ["succeeded", "retried", "dead_lettered"];

export function sortJobStats<T extends { status: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftIndex = JOB_STATUS_ORDER.indexOf(left.status);
    const rightIndex = JOB_STATUS_ORDER.indexOf(right.status);
    const safeLeft = leftIndex === -1 ? JOB_STATUS_ORDER.length : leftIndex;
    const safeRight = rightIndex === -1 ? JOB_STATUS_ORDER.length : rightIndex;

    if (safeLeft !== safeRight) {
      return safeLeft - safeRight;
    }

    return left.status.localeCompare(right.status);
  });
}

export function statusToneForJob(status: string): StatusTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "retried":
      return "warning";
    case "dead_lettered":
      return "danger";
    default:
      return "neutral";
  }
}

export function failedJobSortValue(
  job: FailedJobEntry,
  key: "job_id" | "queue" | "status" | "attempt" | "duration_ms" | "created_at",
) {
  switch (key) {
    case "attempt":
      return job.attempt ?? 0;
    case "duration_ms":
      return job.duration_ms ?? 0;
    case "created_at":
      return parseDateTimeValue(job.created_at)?.getTime() ?? 0;
    default:
      return String(job[key] ?? "").toLowerCase();
  }
}

export function mergeWebSocketChannels(
  configs: WebSocketChannelConfig[],
  stats: WebSocketChannelStats[],
) {
  const statsById = new Map(stats.map((entry) => [entry.id, entry]));

  return configs.map<MergedWebSocketChannel>((config) => {
    const channelStats = statsById.get(config.id);

    return {
      ...config,
      subscriptions_total: channelStats?.subscriptions_total ?? 0,
      unsubscribes_total: channelStats?.unsubscribes_total ?? 0,
      active_subscriptions: channelStats?.active_subscriptions ?? 0,
      inbound_messages_total: channelStats?.inbound_messages_total ?? 0,
      outbound_messages_total: channelStats?.outbound_messages_total ?? 0,
    };
  });
}

export function isIdleChannel(channel: MergedWebSocketChannel) {
  return (
    channel.active_subscriptions === 0 &&
    channel.inbound_messages_total === 0 &&
    channel.outbound_messages_total === 0
  );
}

export function channelActivityLabel(channel: MergedWebSocketChannel) {
  return isIdleChannel(channel) ? "idle" : "hot";
}

export function channelSortValue(
  channel: MergedWebSocketChannel,
  key: "id" | "active_subscriptions" | "outbound_messages_total",
) {
  switch (key) {
    case "id":
      return channel.id.toLowerCase();
    case "active_subscriptions":
      return channel.active_subscriptions;
    case "outbound_messages_total":
      return channel.outbound_messages_total;
  }
}

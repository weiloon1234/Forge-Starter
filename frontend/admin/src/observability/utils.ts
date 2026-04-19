import axios from "axios";
import type {
  FailedJobEntry,
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

function normalizeDateValue(value: string | number | null | undefined) {
  if (value == null) return null;

  if (typeof value === "number") {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }

  if (value.startsWith("timestamptz:")) {
    return new Date(value.slice("timestamptz:".length));
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

export function formatDateTime(value: string | number | null | undefined) {
  const date = normalizeDateValue(value);
  if (!date) return typeof value === "string" && value ? value : "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
      return normalizeDateValue(job.created_at)?.getTime() ?? 0;
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

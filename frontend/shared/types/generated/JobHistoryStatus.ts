// Auto-generated from AppEnum. Do not edit.

export type JobHistoryStatus = "succeeded" | "retried" | "dead_lettered";

export const JobHistoryStatusValues = [
  "succeeded",
  "retried",
  "dead_lettered",
] as const;

export const JobHistoryStatusOptions = [
  { value: "succeeded", labelKey: "enum.job_history_status.succeeded" },
  { value: "retried", labelKey: "enum.job_history_status.retried" },
  { value: "dead_lettered", labelKey: "enum.job_history_status.dead_lettered" },
] as const;

export const JobHistoryStatusMeta = {
id: "job_history_status",
keyKind: "string",
options: JobHistoryStatusOptions,
} as const;

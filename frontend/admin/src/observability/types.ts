export type ProbeState = "healthy" | "unhealthy";

export interface HealthResponse {
  state: ProbeState;
}

export interface ReadinessProbe {
  id: string;
  state: ProbeState;
  message?: string | null;
}

export interface ReadinessResponse {
  state: ProbeState;
  probes: ReadinessProbe[];
}

export interface HttpDurationBucketSnapshot {
  le_ms: number;
  cumulative_count: number;
}

export interface HttpDurationHistogramSnapshot {
  count: number;
  sum_ms: number;
  buckets: HttpDurationBucketSnapshot[];
}

export interface HttpRuntimeSnapshot {
  requests_total: number;
  informational_total: number;
  success_total: number;
  redirection_total: number;
  client_error_total: number;
  server_error_total: number;
  duration_ms: HttpDurationHistogramSnapshot;
}

export interface HttpStatsResponse {
  stats: HttpStatsSummary;
  top_slowest_routes: HttpRouteRanking[];
  top_error_routes: HttpRouteRanking[];
  recent_slow_requests: HttpRequestSample[];
  recent_error_requests: HttpRequestSample[];
}

export interface HttpStatsSummary {
  requests_total: number;
  retained_request_count: number;
  retention_capacity: number;
  slow_request_threshold_ms: number;
  route_count: number;
  slow_request_count: number;
  error_request_count: number;
}

export interface HttpRouteRanking {
  method: string;
  path: string;
  requests_total: number;
  informational_total: number;
  success_total: number;
  redirection_total: number;
  client_error_total: number;
  server_error_total: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
  latest_recorded_at: string;
}

export interface HttpRequestSample {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  request_id?: string | null;
  trace_id?: string | null;
  recorded_at: string;
}

export interface RuntimeResponse {
  backend: string;
  bootstrap_complete: boolean;
  http?: HttpRuntimeSnapshot;
  scheduler: {
    ticks_total: number;
    executed_schedules_total: number;
    leadership_acquired_total: number;
    leadership_lost_total: number;
    leader_active: boolean;
  };
  jobs: {
    enqueued_total: number;
    leased_total: number;
    started_total: number;
    succeeded_total: number;
    retried_total: number;
    expired_requeues_total: number;
    dead_lettered_total: number;
  };
  websocket: {
    opened_total: number;
    closed_total: number;
    active_connections: number;
    subscriptions_total: number;
    unsubscribes_total: number;
    active_subscriptions: number;
    inbound_messages_total: number;
    outbound_messages_total: number;
  };
}

export interface JobsStatsResponse {
  stats: Array<{
    status: string;
    count: number;
  }>;
}

export interface FailedJobEntry {
  job_id: string;
  queue: string;
  status: string;
  attempt?: number | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  created_at?: string | null;
  request_id?: string | null;
  trace_id?: string | null;
}

export interface JobsFailedResponse {
  failed_jobs: FailedJobEntry[];
}

export interface SqlObservabilityResponse {
  stats: SqlObservabilityStats;
  top_slowest: SlowQueryEntry[];
  n_plus_one_suspects: NPlusOneSuspect[];
  slow_queries: SlowQueryEntry[];
}

export interface SqlObservabilityStats {
  retained_count: number;
  capacity: number;
  slow_query_threshold_ms: number;
  max_duration_ms?: number | null;
  avg_duration_ms?: number | null;
  latest_recorded_at?: string | null;
  n_plus_one_suspect_count: number;
}

export interface SlowQueryEntry {
  sql: string;
  duration_ms: number;
  label?: string | null;
  request_id?: string | null;
  trace_id?: string | null;
  recorded_at: string;
}

export interface NPlusOneSuspect {
  method: string;
  path: string;
  request_id?: string | null;
  trace_id?: string | null;
  fingerprint: string;
  repeat_count: number;
  total_duration_ms: number;
  max_duration_ms: number;
  avg_duration_ms: number;
  rows_total: number;
  labels: string[];
  kinds: string[];
  sample_sql: string;
  first_recorded_at: string;
  latest_recorded_at: string;
}

export interface WebSocketStatsResponse {
  global: {
    active_connections: number;
    active_subscriptions: number;
    subscriptions_total: number;
    unsubscribes_total: number;
    inbound_messages_total: number;
    outbound_messages_total: number;
    opened_total: number;
    closed_total: number;
  };
  channels: WebSocketChannelStats[];
}

export interface WebSocketChannelStats {
  id: string;
  subscriptions_total: number;
  unsubscribes_total: number;
  active_subscriptions: number;
  inbound_messages_total: number;
  outbound_messages_total: number;
}

export interface WebSocketChannelsResponse {
  channels: WebSocketChannelConfig[];
}

export interface WebSocketChannelConfig {
  id: string;
  presence: boolean;
  replay_count: number;
  allow_client_events: boolean;
  requires_auth: boolean;
  guard: string | null;
  permissions: string[];
}

export interface WebSocketPresenceResponse {
  channel: string;
  count: number;
  members: Array<{
    actor_id: string;
    joined_at: number;
  }>;
}

export interface WebSocketHistoryMessage {
  channel: string;
  event: string;
  room?: string | null;
  payload?: unknown;
  payload_size_bytes?: number;
}

export interface WebSocketHistoryResponse {
  channel: string;
  messages: WebSocketHistoryMessage[];
}

export interface MergedWebSocketChannel
  extends WebSocketChannelConfig,
    WebSocketChannelStats {}

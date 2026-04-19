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

export interface RuntimeResponse {
  backend: string;
  bootstrap_complete: boolean;
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
}

export interface JobsFailedResponse {
  failed_jobs: FailedJobEntry[];
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

import { Button, Input, Select } from "@shared/components";
import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { observabilityApi } from "@/api";
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
  MergedWebSocketChannel,
  WebSocketChannelsResponse,
  WebSocketHistoryResponse,
  WebSocketPresenceResponse,
  WebSocketStatsResponse,
} from "@/observability/types";
import {
  channelActivityLabel,
  channelSortValue,
  cn,
  formatDateTime,
  formatJsonPreview,
  formatNumber,
  isIdleChannel,
  mergeWebSocketChannels,
} from "@/observability/utils";

const WEBSOCKET_POLL_MS = 5_000;
const HISTORY_LIMIT = 20;

type WebSocketDashboardData = {
  stats: WebSocketStatsResponse;
  registry: WebSocketChannelsResponse;
};

type ChannelTab = "stats" | "presence" | "history" | "config";
type ChannelSortKey = "id" | "active_subscriptions" | "outbound_messages_total";
type ChannelSortDirection = "asc" | "desc";
type PresenceFilter = "all" | "presence";
type AuthFilter = "all" | "auth";
type ActivityFilter = "all" | "active" | "idle";

async function fetchWebSocketDashboard(): Promise<WebSocketDashboardData> {
  const [stats, registry] = await Promise.all([
    observabilityApi.get<WebSocketStatsResponse>("/_forge/ws/stats"),
    observabilityApi.get<WebSocketChannelsResponse>("/_forge/ws/channels"),
  ]);

  return {
    stats: stats.data,
    registry: registry.data,
  };
}

export function WebSocketDashboardPage() {
  const { t } = useTranslation();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ChannelTab>("stats");
  const [channelQuery, setChannelQuery] = useState("");
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  const [authFilter, setAuthFilter] = useState<AuthFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortKey, setSortKey] = useState<ChannelSortKey>(
    "active_subscriptions",
  );
  const [sortDirection, setSortDirection] =
    useState<ChannelSortDirection>("desc");
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(
    () => new Set(),
  );
  const deferredQuery = useDeferredValue(channelQuery);

  const { data, loading, refreshing, error, lastUpdated, refresh } =
    usePollingResource(fetchWebSocketDashboard, {
      intervalMs: WEBSOCKET_POLL_MS,
    });

  const mergedChannels = useMemo(
    () =>
      mergeWebSocketChannels(
        data?.registry.channels ?? [],
        data?.stats.channels ?? [],
      ),
    [data?.registry.channels, data?.stats.channels],
  );

  const filteredChannels = useMemo(() => {
    let next = [...mergedChannels];

    if (deferredQuery.trim()) {
      const normalized = deferredQuery.trim().toLowerCase();
      next = next.filter((channel) =>
        channel.id.toLowerCase().includes(normalized),
      );
    }

    if (presenceFilter === "presence") {
      next = next.filter((channel) => channel.presence);
    }

    if (authFilter === "auth") {
      next = next.filter((channel) => channel.requires_auth);
    }

    if (activityFilter === "active") {
      next = next.filter((channel) => channel.active_subscriptions > 0);
    }

    if (activityFilter === "idle") {
      next = next.filter(isIdleChannel);
    }

    next.sort((left, right) => {
      const leftValue = channelSortValue(left, sortKey);
      const rightValue = channelSortValue(right, sortKey);

      if (leftValue < rightValue) {
        return sortDirection === "asc" ? -1 : 1;
      }
      if (leftValue > rightValue) {
        return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });

    return next;
  }, [
    activityFilter,
    authFilter,
    deferredQuery,
    mergedChannels,
    presenceFilter,
    sortDirection,
    sortKey,
  ]);

  const selectedChannel = useMemo(
    () =>
      mergedChannels.find((channel) => channel.id === selectedChannelId) ??
      null,
    [mergedChannels, selectedChannelId],
  );

  const topChannels = useMemo(
    () =>
      [...mergedChannels]
        .sort((left, right) => {
          if (right.active_subscriptions !== left.active_subscriptions) {
            return right.active_subscriptions - left.active_subscriptions;
          }
          return right.outbound_messages_total - left.outbound_messages_total;
        })
        .slice(0, 5),
    [mergedChannels],
  );

  const idleChannels = useMemo(
    () => mergedChannels.filter(isIdleChannel),
    [mergedChannels],
  );

  useEffect(() => {
    if (
      selectedChannelId &&
      !mergedChannels.some((channel) => channel.id === selectedChannelId)
    ) {
      setSelectedChannelId(null);
    }
  }, [mergedChannels, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannel?.presence && activeTab === "presence") {
      setActiveTab("stats");
    }
  }, [activeTab, selectedChannel?.presence]);

  const {
    data: presenceData,
    loading: presenceLoading,
    refreshing: presenceRefreshing,
    error: presenceError,
    refresh: refreshPresence,
  } = usePollingResource(
    async () => {
      const response = await observabilityApi.get<WebSocketPresenceResponse>(
        `/_forge/ws/presence/${encodeURIComponent(selectedChannel?.id ?? "")}`,
      );
      return response.data;
    },
    {
      enabled: Boolean(selectedChannel?.presence && activeTab === "presence"),
      intervalMs: WEBSOCKET_POLL_MS,
      dependencies: [selectedChannel?.id, activeTab],
    },
  );

  const {
    data: historyData,
    error: historyError,
    refresh: refreshHistory,
  } = usePollingResource(
    async () => {
      const response = await observabilityApi.get<WebSocketHistoryResponse>(
        `/_forge/ws/history/${encodeURIComponent(
          selectedChannel?.id ?? "",
        )}?limit=${HISTORY_LIMIT}`,
      );
      return response.data;
    },
    {
      enabled: Boolean(selectedChannel && activeTab === "history"),
      intervalMs: WEBSOCKET_POLL_MS,
      dependencies: [selectedChannel?.id, activeTab],
    },
  );

  const toggleSort = (nextSortKey: ChannelSortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "id" ? "asc" : "desc");
  };

  const renderSortLabel = (label: string, nextSortKey: ChannelSortKey) => (
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

  const registryColumns: ObservabilityColumn<MergedWebSocketChannel>[] = [
    {
      key: "id",
      label: renderSortLabel(t("observability.common.channel_id"), "id"),
      render: (channel) => (
        <div className="sf-obs-channel-cell">
          <span className="sf-obs-table__cell--mono">{channel.id}</span>
          <div className="sf-obs-inline-badges">
            <StatusBadge
              tone={
                channelActivityLabel(channel) === "hot" ? "warning" : "neutral"
              }
            >
              {t(`observability.websocket.${channelActivityLabel(channel)}`)}
            </StatusBadge>
            {channel.presence && (
              <StatusBadge tone="info">
                {t("observability.common.presence")}
              </StatusBadge>
            )}
            {channel.requires_auth && (
              <StatusBadge tone="success">
                {t("observability.websocket.auth")}
              </StatusBadge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "config",
      label: t("observability.common.config"),
      render: (channel) => (
        <div className="sf-obs-table-stack">
          <span>
            {t("observability.common.replay_count")}:{" "}
            {formatNumber(channel.replay_count)}
          </span>
          <span>
            {t("observability.common.guard")}: {channel.guard ?? "—"}
          </span>
        </div>
      ),
    },
    {
      key: "active_subscriptions",
      label: renderSortLabel(
        t("observability.common.active_subscriptions"),
        "active_subscriptions",
      ),
      align: "right",
      render: (channel) => formatNumber(channel.active_subscriptions),
    },
    {
      key: "outbound",
      label: renderSortLabel(
        t("observability.common.outbound_messages"),
        "outbound_messages_total",
      ),
      align: "right",
      render: (channel) => formatNumber(channel.outbound_messages_total),
    },
    {
      key: "permissions",
      label: t("observability.common.permissions"),
      render: (channel) =>
        channel.permissions.length > 0 ? channel.permissions.join(", ") : "—",
    },
  ];

  if (!data && error) {
    return (
      <div className="sf-obs-page">
        <div className="sf-page-header">
          <div>
            <h1 className="sf-page-title">{t("WebSocket")}</h1>
            <p className="sf-page-subtitle">
              {t("observability.websocket.subtitle")}
            </p>
          </div>
        </div>
        <ErrorState
          title={t("observability.websocket.unavailable")}
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
          <h1 className="sf-page-title">{t("WebSocket")}</h1>
          <p className="sf-page-subtitle">
            {t("observability.websocket.subtitle")}
          </p>
        </div>
        <RefreshIndicator
          lastUpdated={lastUpdated}
          refreshing={refreshing || loading}
          onRefresh={refresh}
        />
      </div>

      <p className="sf-obs-page-note">
        {t("observability.common.node_local_note")}
      </p>

      <div className="sf-obs-grid sf-obs-grid--metrics">
        <MetricCard
          label={t("observability.websocket.active_connections")}
          value={formatNumber(data?.stats.global.active_connections)}
          accent="success"
        />
        <MetricCard
          label={t("observability.websocket.active_subscriptions")}
          value={formatNumber(data?.stats.global.active_subscriptions)}
          accent="success"
        />
        <MetricCard
          label={t("observability.websocket.inbound_messages")}
          value={formatNumber(data?.stats.global.inbound_messages_total)}
        />
        <MetricCard
          label={t("observability.websocket.outbound_messages")}
          value={formatNumber(data?.stats.global.outbound_messages_total)}
        />
        <MetricCard
          label={t("observability.websocket.opened_connections")}
          value={formatNumber(data?.stats.global.opened_total)}
        />
        <MetricCard
          label={t("observability.websocket.closed_connections")}
          value={formatNumber(data?.stats.global.closed_total)}
        />
      </div>

      <div className="sf-obs-grid sf-obs-grid--dual">
        <SectionCard
          title={t("observability.websocket.top_active_channels")}
          subtitle={t("observability.websocket.top_active_channels_subtitle")}
        >
          {topChannels.length === 0 ? (
            <EmptyState title={t("observability.websocket.no_channels")} />
          ) : (
            <div className="sf-obs-channel-rank-list">
              {topChannels.map((channel) => {
                const maxActive =
                  topChannels[0]?.active_subscriptions ||
                  topChannels[0]?.outbound_messages_total ||
                  1;
                const width =
                  maxActive > 0
                    ? (channel.active_subscriptions / maxActive) * 100
                    : 0;

                return (
                  <button
                    type="button"
                    key={channel.id}
                    className="sf-obs-channel-rank"
                    onClick={() => setSelectedChannelId(channel.id)}
                  >
                    <div className="sf-obs-channel-rank__meta">
                      <strong>{channel.id}</strong>
                      <div className="sf-obs-inline-badges">
                        {channel.presence && (
                          <StatusBadge tone="info">
                            {t("observability.common.presence")}
                          </StatusBadge>
                        )}
                        {channel.requires_auth && (
                          <StatusBadge tone="success">
                            {t("observability.websocket.auth")}
                          </StatusBadge>
                        )}
                      </div>
                    </div>
                    <div className="sf-obs-channel-rank__bar">
                      <span style={{ width: `${width}%` }} />
                    </div>
                    <span className="sf-obs-channel-rank__value">
                      {formatNumber(channel.active_subscriptions)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={t("observability.websocket.idle_channels")}
          subtitle={t("observability.websocket.idle_channels_subtitle")}
        >
          {idleChannels.length === 0 ? (
            <EmptyState title={t("observability.websocket.no_idle_channels")} />
          ) : (
            <div className="sf-obs-chip-row">
              {idleChannels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  className="sf-obs-idle-chip"
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  {channel.id}
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={t("observability.websocket.channel_registry")}
        subtitle={t("observability.websocket.channel_registry_subtitle")}
      >
        <div className="sf-obs-filter-grid">
          <Input
            name="channel_query"
            label={t("Search")}
            value={channelQuery}
            placeholder={t("observability.common.search_channels")}
            onChange={(value) => setChannelQuery(value)}
          />
          <Select
            name="presence_filter"
            label={t("observability.common.presence_filter")}
            value={presenceFilter}
            options={[
              {
                value: "all",
                label: t("observability.common.all_channels"),
              },
              {
                value: "presence",
                label: t("observability.common.presence_only"),
              },
            ]}
            onChange={(value) => setPresenceFilter(value as PresenceFilter)}
          />
          <Select
            name="auth_filter"
            label={t("observability.common.auth_filter")}
            value={authFilter}
            options={[
              {
                value: "all",
                label: t("observability.common.all_channels"),
              },
              {
                value: "auth",
                label: t("observability.common.auth_only"),
              },
            ]}
            onChange={(value) => setAuthFilter(value as AuthFilter)}
          />
          <Select
            name="activity_filter"
            label={t("observability.common.activity_filter")}
            value={activityFilter}
            options={[
              {
                value: "all",
                label: t("observability.common.all_activity"),
              },
              {
                value: "active",
                label: t("observability.common.active_only"),
              },
              {
                value: "idle",
                label: t("observability.common.idle_only"),
              },
            ]}
            onChange={(value) => setActivityFilter(value as ActivityFilter)}
          />
        </div>

        <DataTable
          columns={registryColumns}
          rows={filteredChannels}
          rowKey={(channel) => channel.id}
          onRowClick={(channel) => {
            setSelectedChannelId(channel.id);
            setActiveTab("stats");
          }}
          empty={<EmptyState title={t("observability.common.no_results")} />}
        />
      </SectionCard>

      <RightDrawer
        open={Boolean(selectedChannel)}
        title={
          selectedChannel?.id ?? t("observability.websocket.channel_detail")
        }
        subtitle={t("observability.websocket.channel_detail_subtitle")}
        onClose={() => setSelectedChannelId(null)}
      >
        {selectedChannel && (
          <div className="sf-obs-drawer-stack">
            <div className="sf-obs-tab-row">
              {(
                [
                  "stats",
                  selectedChannel.presence ? "presence" : null,
                  "history",
                  "config",
                ].filter(Boolean) as ChannelTab[]
              ).map((tab) => (
                <Button
                  key={tab}
                  type="button"
                  unstyled
                  className={cn(
                    "sf-obs-tab",
                    activeTab === tab && "sf-obs-tab--active",
                  )}
                  onClick={() => setActiveTab(tab)}
                >
                  {t(`observability.common.${tab}`)}
                </Button>
              ))}
            </div>

            {activeTab === "stats" && (
              <KeyValueList
                items={[
                  {
                    key: "active_subscriptions",
                    label: t("observability.common.active_subscriptions"),
                    value: formatNumber(selectedChannel.active_subscriptions),
                  },
                  {
                    key: "subscriptions_total",
                    label: t("observability.common.subscriptions_total"),
                    value: formatNumber(selectedChannel.subscriptions_total),
                  },
                  {
                    key: "unsubscribes_total",
                    label: t("observability.common.unsubscribes_total"),
                    value: formatNumber(selectedChannel.unsubscribes_total),
                  },
                  {
                    key: "inbound_messages",
                    label: t("observability.common.inbound_messages"),
                    value: formatNumber(selectedChannel.inbound_messages_total),
                  },
                  {
                    key: "outbound_messages",
                    label: t("observability.common.outbound_messages"),
                    value: formatNumber(
                      selectedChannel.outbound_messages_total,
                    ),
                  },
                  {
                    key: "replay_count",
                    label: t("observability.common.replay_count"),
                    value: formatNumber(selectedChannel.replay_count),
                  },
                ]}
              />
            )}

            {activeTab === "presence" && selectedChannel.presence && (
              <div className="sf-obs-drawer-section">
                <div className="sf-obs-section-card__actions">
                  <RefreshIndicator
                    lastUpdated={null}
                    refreshing={presenceRefreshing || presenceLoading}
                    onRefresh={refreshPresence}
                  />
                </div>
                {presenceError && !presenceData ? (
                  <ErrorState
                    title={t("observability.common.presence")}
                    description={presenceError}
                    onRetry={refreshPresence}
                  />
                ) : presenceData?.members.length ? (
                  <DataTable
                    columns={[
                      {
                        key: "actor_id",
                        label: t("observability.common.actor_id"),
                        className: "sf-obs-table__cell--mono",
                        render: (member) => member.actor_id,
                      },
                      {
                        key: "joined_at",
                        label: t("observability.common.joined_at"),
                        render: (member) => formatDateTime(member.joined_at),
                      },
                    ]}
                    rows={presenceData.members}
                    rowKey={(member) =>
                      `${member.actor_id}:${member.joined_at}`
                    }
                    empty={
                      <EmptyState
                        title={t("observability.websocket.no_presence_members")}
                      />
                    }
                  />
                ) : (
                  <EmptyState
                    title={t("observability.websocket.no_presence_members")}
                  />
                )}
              </div>
            )}

            {activeTab === "history" && (
              <div className="sf-obs-drawer-section">
                <div className="sf-obs-note">
                  {t("observability.common.history_note", {
                    count: 50,
                  })}
                </div>
                {historyError && !historyData ? (
                  <ErrorState
                    title={t("observability.common.recent_history")}
                    description={historyError}
                    onRetry={refreshHistory}
                  />
                ) : historyData?.messages.length ? (
                  <div className="sf-obs-history-list">
                    {historyData.messages.map((message, index) => {
                      const historyKey = `${message.event}:${message.room ?? "none"}:${index}`;
                      const expanded = expandedHistory.has(historyKey);
                      const hasPayload = "payload" in message;

                      return (
                        <article
                          key={historyKey}
                          className="sf-obs-history-card"
                        >
                          <div className="sf-obs-history-card__header">
                            <div>
                              <strong>{message.event}</strong>
                              <p>
                                {message.room ??
                                  t("observability.common.no_room")}
                              </p>
                            </div>
                            {hasPayload ? (
                              <Button
                                type="button"
                                unstyled
                                className="sf-obs-history-toggle"
                                onClick={() => {
                                  setExpandedHistory((current) => {
                                    const next = new Set(current);
                                    if (next.has(historyKey)) {
                                      next.delete(historyKey);
                                    } else {
                                      next.add(historyKey);
                                    }
                                    return next;
                                  });
                                }}
                              >
                                {expanded ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </Button>
                            ) : (
                              <StatusBadge tone="neutral">
                                {t("observability.common.payload_hidden")}
                              </StatusBadge>
                            )}
                          </div>
                          <p className="sf-obs-history-card__preview">
                            {hasPayload
                              ? formatJsonPreview(message.payload)
                              : `${t("observability.common.payload_size")}: ${formatNumber(
                                  message.payload_size_bytes,
                                )} B`}
                          </p>
                          {hasPayload && expanded && (
                            <JsonViewer value={message.payload} />
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title={t("observability.websocket.no_history")} />
                )}
              </div>
            )}

            {activeTab === "config" && (
              <KeyValueList
                items={[
                  {
                    key: "id",
                    label: t("observability.common.channel_id"),
                    value: selectedChannel.id,
                  },
                  {
                    key: "presence",
                    label: t("observability.common.presence"),
                    value: selectedChannel.presence
                      ? t("enabled")
                      : t("disabled"),
                  },
                  {
                    key: "replay_count",
                    label: t("observability.common.replay_count"),
                    value: formatNumber(selectedChannel.replay_count),
                  },
                  {
                    key: "allow_client_events",
                    label: t("observability.common.allow_client_events"),
                    value: selectedChannel.allow_client_events
                      ? t("enabled")
                      : t("disabled"),
                  },
                  {
                    key: "requires_auth",
                    label: t("observability.common.requires_auth"),
                    value: selectedChannel.requires_auth
                      ? t("enabled")
                      : t("disabled"),
                  },
                  {
                    key: "guard",
                    label: t("observability.common.guard"),
                    value: selectedChannel.guard ?? "—",
                  },
                  {
                    key: "permissions",
                    label: t("observability.common.permissions"),
                    value:
                      selectedChannel.permissions.length > 0
                        ? selectedChannel.permissions.join(", ")
                        : "—",
                  },
                ]}
              />
            )}
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

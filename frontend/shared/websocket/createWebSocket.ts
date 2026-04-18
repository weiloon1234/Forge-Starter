import { createStore, useStore } from "@shared/store/createStore";

// ── Types ──────────────────────────────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type WebSocketPayload = unknown;
type WebSocketEventHandler = (payload: WebSocketPayload) => void;

export interface WebSocketChannelEvent {
  event: string;
  payload: WebSocketPayload;
}

type WebSocketWildcardHandler = (message: WebSocketChannelEvent) => void;
type WebSocketListener = WebSocketEventHandler | WebSocketWildcardHandler;

interface ServerMessage {
  channel: string;
  event: string;
  room?: string | null;
  payload: WebSocketPayload;
}

interface WebSocketConfig {
  /** WebSocket server URL, e.g. "ws://localhost:3010/ws" */
  url: string;
  /** Async function that returns a bearer token for auth */
  getToken: () => Promise<string>;
  /** Auto-reconnect (default true) */
  autoReconnect?: boolean;
  /** Max reconnect delay in ms (default 30000) */
  maxReconnectDelay?: number;
  /** Max reconnect attempts before giving up (default 5) */
  maxReconnectAttempts?: number;
}

export interface WebSocketManager {
  connect: () => void;
  disconnect: () => void;
  subscribe: (channel: string, room?: string) => void;
  unsubscribe: (channel: string, room?: string) => void;
  send: (channel: string, event: string, payload?: WebSocketPayload) => void;
  on(
    channel: string,
    event: "*",
    handler: WebSocketWildcardHandler,
  ): () => void;
  on(
    channel: string,
    event: string,
    handler: WebSocketEventHandler,
  ): () => void;
  useStatus: () => ConnectionStatus;
}

// ── Factory ────────────────────────────────────────────

export function createWebSocket(config: WebSocketConfig): WebSocketManager {
  const {
    url,
    getToken,
    autoReconnect = true,
    maxReconnectDelay = 30000,
    maxReconnectAttempts = 5,
  } = config;

  const statusStore = createStore<{ status: ConnectionStatus }>({
    status: "disconnected",
  });

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempts = 0;
  let intentionalClose = false;
  let connecting = false;

  // Event listener registry: Map<"channel:event", Set<handler>>
  const listeners = new Map<string, Set<WebSocketListener>>();

  // Pending subscriptions (queued while connecting)
  const pendingSubscriptions = new Set<string>();
  const activeSubscriptions = new Set<string>();

  function listenerKey(channel: string, event: string): string {
    return `${channel}:${event}`;
  }

  function setStatus(status: ConnectionStatus) {
    statusStore.setState({ status });
  }

  function sendRaw(data: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function flushPendingSubscriptions() {
    for (const key of pendingSubscriptions) {
      const [channel, room] = key.split("|");
      sendRaw({ action: "Subscribe", channel, room: room || undefined });
      activeSubscriptions.add(key);
    }
    pendingSubscriptions.clear();
  }

  function resubscribeAll() {
    for (const key of activeSubscriptions) {
      const [channel, room] = key.split("|");
      sendRaw({ action: "Subscribe", channel, room: room || undefined });
    }
  }

  function handleMessage(event: MessageEvent) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // Dispatch to listeners
    const key = listenerKey(msg.channel, msg.event);
    const handlers = listeners.get(key);
    if (handlers) {
      for (const handler of handlers) {
        (handler as WebSocketEventHandler)(msg.payload);
      }
    }

    // Also dispatch wildcard listeners for the channel
    const wildcardKey = listenerKey(msg.channel, "*");
    const wildcardHandlers = listeners.get(wildcardKey);
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        (handler as WebSocketWildcardHandler)({
          event: msg.event,
          payload: msg.payload,
        });
      }
    }
  }

  function scheduleReconnect() {
    if (!autoReconnect || intentionalClose) return;
    if (reconnectAttempts >= maxReconnectAttempts) return;

    const delay = Math.min(1000 * 2 ** reconnectAttempts, maxReconnectDelay);
    reconnectAttempts++;

    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  async function connect() {
    if (
      connecting ||
      ws?.readyState === WebSocket.OPEN ||
      ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    connecting = true;
    intentionalClose = false;
    setStatus("connecting");

    try {
      const token = await getToken();
      const separator = url.includes("?") ? "&" : "?";
      const wsUrl = `${url}${separator}token=${encodeURIComponent(token)}`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        connecting = false;
        setStatus("connected");
        reconnectAttempts = 0;
        resubscribeAll();
        flushPendingSubscriptions();
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        connecting = false;
        ws = null;
        setStatus("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    } catch {
      connecting = false;
      setStatus("disconnected");
      scheduleReconnect();
    }
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    reconnectAttempts = 0;
    activeSubscriptions.clear();
    pendingSubscriptions.clear();
    if (ws) {
      ws.close();
      ws = null;
    }
    setStatus("disconnected");
  }

  function subscribe(channel: string, room?: string) {
    const key = room ? `${channel}|${room}` : channel;
    if (activeSubscriptions.has(key) || pendingSubscriptions.has(key)) return;

    if (ws?.readyState === WebSocket.OPEN) {
      sendRaw({ action: "Subscribe", channel, room });
      activeSubscriptions.add(key);
    } else {
      pendingSubscriptions.add(key);
    }
  }

  function unsubscribe(channel: string, room?: string) {
    const key = room ? `${channel}|${room}` : channel;
    activeSubscriptions.delete(key);
    pendingSubscriptions.delete(key);

    if (ws?.readyState === WebSocket.OPEN) {
      sendRaw({ action: "Unsubscribe", channel, room });
    }
  }

  function send(channel: string, event: string, payload?: WebSocketPayload) {
    sendRaw({ action: "Message", channel, event, payload });
  }

  function on(
    channel: string,
    event: string,
    handler: WebSocketEventHandler | WebSocketWildcardHandler,
  ): () => void {
    const key = listenerKey(channel, event);
    let handlers = listeners.get(key);
    if (!handlers) {
      handlers = new Set();
      listeners.set(key, handlers);
    }
    handlers.add(handler);

    return () => {
      const handlers = listeners.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          listeners.delete(key);
        }
      }
    };
  }

  function useStatus(): ConnectionStatus {
    return useStore(statusStore).status;
  }

  return {
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    send,
    on: on as WebSocketManager["on"],
    useStatus,
  };
}

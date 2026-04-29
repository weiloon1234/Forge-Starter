import { createStore, useStore } from "@shared/store/createStore";

export interface RuntimeConfig {
  app_url: string;
  ws_url: string | null;
  locales: string[];
  default_locale: string;
}

export interface EnabledCountry {
  iso2: string;
  name: string;
  flag_emoji: string | null;
  calling_code: string | null;
  is_default: boolean;
}

export interface AppConfig extends RuntimeConfig {
  settings: Record<string, unknown>;
  countries: EnabledCountry[];
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

const LOCAL_WEBSOCKET_URL = "ws://127.0.0.1:3010/ws";

const DEFAULT_CONFIG: AppConfig = {
  app_url: "http://127.0.0.1:3000",
  ws_url: LOCAL_WEBSOCKET_URL,
  locales: ["en"],
  default_locale: "en",
  settings: {},
  countries: [],
};

export function getConfig(): AppConfig {
  const config = window.__APP_CONFIG__;
  const wsUrl = resolveWebSocketUrl(config?.ws_url);

  return {
    ...DEFAULT_CONFIG,
    ...config,
    ws_url: wsUrl,
    locales: config?.locales ?? DEFAULT_CONFIG.locales,
    settings: config?.settings ?? DEFAULT_CONFIG.settings,
    countries: config?.countries ?? DEFAULT_CONFIG.countries,
  };
}

function resolveWebSocketUrl(configuredUrl: string | null | undefined): string {
  const envUrl = viteEnv("VITE_WS_URL")?.trim() || null;
  const rawUrl = configuredUrl?.trim() || envUrl || defaultWebSocketUrl();

  return normalizeWebSocketUrl(rawUrl, envUrl);
}

function viteEnv(key: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[
    key
  ];
}

function defaultWebSocketUrl(): string {
  if (!hasBrowserLocation() || isLoopbackHost(window.location.hostname)) {
    return LOCAL_WEBSOCKET_URL;
  }

  return browserWebSocketUrl("/ws");
}

function normalizeWebSocketUrl(rawUrl: string, envUrl: string | null): string {
  if (!hasBrowserLocation()) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl, window.location.origin);

    if (url.protocol === "http:") {
      url.protocol = "ws:";
    } else if (url.protocol === "https:") {
      url.protocol = "wss:";
    }

    if (!isLoopbackHost(window.location.hostname) && isLoopbackHost(url.hostname)) {
      return envUrl
        ? normalizeWebSocketUrl(envUrl, null)
        : browserWebSocketUrl(url.pathname || "/ws", url.search);
    }

    if (window.location.protocol === "https:" && url.protocol === "ws:") {
      url.protocol = "wss:";
    }

    return url.toString();
  } catch {
    return defaultWebSocketUrl();
  }
}

function browserWebSocketUrl(path: string, search = ""): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}${search}`;
}

function hasBrowserLocation(): boolean {
  return typeof window !== "undefined" && typeof window.location !== "undefined";
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  );
}

export interface RuntimeState {
  config: RuntimeConfig;
  settings: Record<string, unknown>;
  countries: EnabledCountry[];
}

function toRuntimeState(config: AppConfig): RuntimeState {
  const { app_url, ws_url, locales, default_locale, settings, countries } =
    config;

  return {
    config: {
      app_url,
      ws_url,
      locales,
      default_locale,
    },
    settings,
    countries,
  };
}

const store = createStore<RuntimeState>(toRuntimeState(getConfig()));

export const runtimeStore = {
  get config() {
    return store.getState().config;
  },

  get settings() {
    return store.getState().settings;
  },

  get countries() {
    return store.getState().countries;
  },

  hydrate(config: AppConfig = getConfig()) {
    store.setState(toRuntimeState(config));
  },
};

export function useRuntimeStore() {
  return useStore(store);
}

export { store as runtimeStoreRaw };

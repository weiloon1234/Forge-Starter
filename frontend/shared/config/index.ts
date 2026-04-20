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

const DEFAULT_CONFIG: AppConfig = {
  app_url: "http://127.0.0.1:3000",
  ws_url: "ws://127.0.0.1:3010/ws",
  locales: ["en"],
  default_locale: "en",
  settings: {},
  countries: [],
};

export function getConfig(): AppConfig {
  const config = window.__APP_CONFIG__;

  return {
    ...DEFAULT_CONFIG,
    ...config,
    locales: config?.locales ?? DEFAULT_CONFIG.locales,
    settings: config?.settings ?? DEFAULT_CONFIG.settings,
    countries: config?.countries ?? DEFAULT_CONFIG.countries,
  };
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

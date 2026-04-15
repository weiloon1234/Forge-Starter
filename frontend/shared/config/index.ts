export interface AppConfig {
  app_url: string;
  ws_url: string | null;
  locales: string[];
  default_locale: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

export function getConfig(): AppConfig {
  return (
    window.__APP_CONFIG__ ?? {
      app_url: "http://127.0.0.1:3000",
      ws_url: "ws://127.0.0.1:3010/ws",
      locales: ["en"],
      default_locale: "en",
    }
  );
}

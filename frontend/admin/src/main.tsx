import { getConfig, runtimeStore } from "@shared/config";
import { buildResources, initI18n } from "@shared/i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

// Load locale files from project root locales/ (shared with Rust backend)
const localeModules = import.meta.glob("../../../locales/**/*.json", {
  eager: true,
});
const runtimeConfig = getConfig();
initI18n(buildResources(localeModules), {
  defaultLocale: runtimeConfig.default_locale,
});
runtimeStore.hydrate(runtimeConfig);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

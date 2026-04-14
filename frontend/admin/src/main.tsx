import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initI18n, buildResources } from "@shared/i18n";
import App from "./App";
import "./styles/app.css";

// Load locale files from project root locales/ (shared with Rust backend)
const localeModules = import.meta.glob("../../../locales/**/*.json", {
  eager: true,
});
initI18n(buildResources(localeModules));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

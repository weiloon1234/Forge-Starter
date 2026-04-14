import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { localeStore, localeStoreRaw } from "./localeStore";

/**
 * Initialize i18n with loaded resources.
 *
 * Call once in each portal's main.tsx:
 *
 *   import { initI18n } from "@shared/i18n";
 *   initI18n(resources);
 *
 * Resources format (matches i18next):
 *   {
 *     en: { messages: {...}, validation: {...} },
 *     ms: { messages: {...}, validation: {...} },
 *   }
 *
 * The `{{variable}}` syntax is shared with Forge backend — same JSON files, same placeholders.
 */
export function initI18n(
  resources: Record<string, Record<string, any>>,
  options?: { defaultLocale?: string; defaultNS?: string }
) {
  const defaultLocale = options?.defaultLocale ?? "en";
  const defaultNS = options?.defaultNS ?? "messages";

  i18n.use(initReactI18next).init({
    resources,
    lng: localeStore.locale,
    fallbackLng: defaultLocale,
    defaultNS,
    interpolation: {
      escapeValue: false, // React already escapes
      // {{variable}} syntax — matches Forge backend
      prefix: "{{",
      suffix: "}}",
    },
  });

  // Register available locales
  localeStore.setAvailable(Object.keys(resources));

  // Sync locale store → i18next (when localeStore.setLocale is called)
  localeStoreRaw.subscribe(() => {
    const { locale } = localeStoreRaw.getState();
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
  });

  return i18n;
}

/**
 * Helper to transform Vite glob imports into i18next resources.
 *
 * Usage in portal main.tsx:
 *
 *   const modules = import.meta.glob("../../../locales/*.json", { eager: true });
 *   const resources = buildResources(modules);
 *   initI18n(resources);
 *
 * Expects file paths like: .../locales/en/messages.json → { en: { messages: {...} } }
 */
export function buildResources(
  modules: Record<string, unknown>
): Record<string, Record<string, any>> {
  const resources: Record<string, Record<string, any>> = {};

  for (const [path, mod] of Object.entries(modules)) {
    // Extract locale and namespace from path: .../locales/en/messages.json
    const match = path.match(/\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;

    const [, locale, namespace] = match;
    if (!resources[locale]) resources[locale] = {};
    resources[locale][namespace] = (mod as any).default ?? mod;
  }

  return resources;
}

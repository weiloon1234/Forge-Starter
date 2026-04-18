import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { localeStore, localeStoreRaw } from "./localeStore";

type TranslationTree = Record<string, unknown>;

function isTranslationTree(value: unknown): value is TranslationTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeTranslations(
  base: TranslationTree,
  next: unknown,
): TranslationTree {
  if (!isTranslationTree(next)) {
    return base;
  }

  const merged: TranslationTree = { ...base };

  for (const [key, value] of Object.entries(next)) {
    const current = merged[key];
    merged[key] =
      isTranslationTree(current) && isTranslationTree(value)
        ? mergeTranslations(current, value)
        : value;
  }

  return merged;
}

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
let initialized = false;

export function initI18n(
  resources: Record<string, Record<string, any>>,
  options?: { defaultLocale?: string; defaultNS?: string },
) {
  if (initialized) return i18n;
  initialized = true;
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
 *
 * Forge backend loads locale files into one merged tree, so we mirror that here by
 * folding every locale file into the default `messages` namespace while also keeping
 * the original file namespace available for explicit use.
 */
export function buildResources(
  modules: Record<string, unknown>,
): Record<string, Record<string, any>> {
  const resources: Record<string, Record<string, any>> = {};

  for (const [path, mod] of Object.entries(modules)) {
    // Extract locale and namespace from path: .../locales/en/messages.json
    const match = path.match(/\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;

    const [, locale, namespace] = match;
    const payload = (mod as { default?: unknown }).default ?? mod;

    if (!resources[locale]) {
      resources[locale] = { messages: {} };
    }

    const existingNamespace = resources[locale][namespace];
    resources[locale][namespace] =
      isTranslationTree(existingNamespace) && isTranslationTree(payload)
        ? mergeTranslations(existingNamespace, payload)
        : payload;
    resources[locale].messages = mergeTranslations(
      resources[locale].messages as TranslationTree,
      payload,
    );
  }

  return resources;
}

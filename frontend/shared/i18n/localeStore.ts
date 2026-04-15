import { createStore, useStore } from "../store/createStore";
import { getCookie, setCookie } from "../utils/cookie";

const COOKIE_NAME = "locale";

// ── Store ──────────────────────────────────────────────

interface LocaleState {
  locale: string;
  available: string[];
}

const store = createStore<LocaleState>({
  locale: getCookie(COOKIE_NAME) || "en",
  available: ["en"],
});

// ── Public API ─────────────────────────────────────────

export const localeStore = {
  get locale() {
    return store.getState().locale;
  },

  get available() {
    return store.getState().available;
  },

  /** Change locale — updates cookie + store. i18next listens via subscriber. */
  setLocale(locale: string) {
    setCookie(COOKIE_NAME, locale);
    store.setState({ locale });
  },

  /** Set available locales (called during init). */
  setAvailable(locales: string[]) {
    store.setState({ available: locales });
  },
};

/** React hook — re-renders when locale changes. */
export function useLocale() {
  return useStore(store);
}

// Internal — for i18n init to subscribe
export { store as localeStoreRaw };

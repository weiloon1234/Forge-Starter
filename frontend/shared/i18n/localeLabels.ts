type Translate = (key: string, options?: { defaultValue?: string }) => string;

const LOCALE_LABEL_KEYS: Record<string, string> = {
  en: "Locale EN",
  zh: "Locale ZH",
};

export function getLocaleLabel(locale: string, t: Translate): string {
  const key = LOCALE_LABEL_KEYS[locale];

  if (!key) {
    return locale.toUpperCase();
  }

  return t(key, { defaultValue: locale.toUpperCase() });
}

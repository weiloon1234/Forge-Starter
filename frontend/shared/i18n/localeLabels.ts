type Translate = (key: string, options?: { defaultValue?: string }) => string;

const LOCALE_LABEL_KEYS: Record<string, string> = {
  en: "Locale EN",
  zh: "Locale ZH",
};

const LOCALE_FLAGS: Record<string, string> = {
  en: "🇺🇸",
  zh: "🇨🇳",
};

const LOCALE_COMPACT_LABELS: Record<string, string> = {
  en: "EN",
  zh: "中文",
};

export function getLocaleLabel(locale: string, t: Translate): string {
  const key = LOCALE_LABEL_KEYS[locale];

  if (!key) {
    return locale.toUpperCase();
  }

  return t(key, { defaultValue: locale.toUpperCase() });
}

export function getLocaleFlag(locale: string): string {
  return LOCALE_FLAGS[locale] ?? "🌐";
}

export function getLocaleCompactLabel(locale: string): string {
  return LOCALE_COMPACT_LABELS[locale] ?? locale.toUpperCase();
}

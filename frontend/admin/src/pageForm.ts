import type {
  AdminPageResponse,
  CreatePageRequest,
  UpdatePageRequest,
} from "@shared/types/generated";

export interface PageFormValues extends Record<string, unknown> {
  slug: string;
}

export function titleFieldKey(locale: string): string {
  return `title.${locale}`;
}

export function contentFieldKey(locale: string): string {
  return `content.${locale}`;
}

export function emptyPageFormValues(locales: string[]): PageFormValues {
  const values: PageFormValues = { slug: "" };

  for (const locale of locales) {
    values[titleFieldKey(locale)] = "";
    values[contentFieldKey(locale)] = "";
  }

  return values;
}

export function pageFormValuesFromResponse(
  page: AdminPageResponse,
  locales: string[],
): PageFormValues {
  const values = emptyPageFormValues(locales);
  values.slug = page.slug;

  for (const locale of locales) {
    values[titleFieldKey(locale)] = page.title[locale] ?? "";
    values[contentFieldKey(locale)] = page.content[locale] ?? "";
  }

  return values;
}

function localizedPayload(
  values: PageFormValues,
  locales: string[],
  keyForLocale: (locale: string) => string,
): Record<string, string> {
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      String(values[keyForLocale(locale)] ?? ""),
    ]),
  );
}

export function buildCreatePagePayload(
  values: PageFormValues,
  locales: string[],
): CreatePageRequest {
  return {
    slug: String(values.slug ?? ""),
    title: localizedPayload(values, locales, titleFieldKey),
    content: localizedPayload(values, locales, contentFieldKey),
  };
}

export function buildUpdatePagePayload(
  values: PageFormValues,
  locales: string[],
): UpdatePageRequest {
  return {
    slug: String(values.slug ?? ""),
    title: localizedPayload(values, locales, titleFieldKey),
    content: localizedPayload(values, locales, contentFieldKey),
  };
}

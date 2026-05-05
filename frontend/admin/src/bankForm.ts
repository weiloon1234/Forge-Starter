import type {
  AdminBankResponse,
  UpsertBankRequest,
} from "@shared/types/generated";

export interface BankFormValues extends Record<string, unknown> {
  country_iso2: string;
}

export function bankNameFieldKey(locale: string): string {
  return `name.${locale}`;
}

export function emptyBankFormValues(
  locales: string[],
  defaultCountryIso2: string,
): BankFormValues {
  const values: BankFormValues = {
    country_iso2: defaultCountryIso2,
  };

  for (const locale of locales) {
    values[bankNameFieldKey(locale)] = "";
  }

  return values;
}

export function bankFormValuesFromResponse(
  bank: AdminBankResponse,
  locales: string[],
): BankFormValues {
  const values: BankFormValues = {
    country_iso2: bank.country_iso2,
  };

  for (const locale of locales) {
    values[bankNameFieldKey(locale)] = bank.name[locale] ?? "";
  }

  return values;
}

export function buildBankPayload(
  values: BankFormValues,
  locales: string[],
): UpsertBankRequest {
  return {
    country_iso2: String(values.country_iso2 ?? ""),
    name: Object.fromEntries(
      locales.map((locale) => [
        locale,
        String(values[bankNameFieldKey(locale)] ?? ""),
      ]),
    ),
  };
}

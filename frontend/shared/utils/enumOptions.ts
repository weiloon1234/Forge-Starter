import type { SelectOption } from "@shared/types/form";

/**
 * Convert an AppEnum values array to Select options with translated labels.
 *
 * Usage:
 *   import { CountryStatusValues } from "@shared/types/generated";
 *   const options = enumOptions(CountryStatusValues, t);
 */
export function enumOptions(
  values: readonly string[],
  t: (key: string) => string,
): SelectOption[] {
  return values.map((v) => ({ value: v, label: t(v) }));
}

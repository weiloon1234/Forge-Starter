import type { SelectOption } from "@shared/types/form";

interface AppEnumOption<T extends string | number> {
  readonly value: T;
  readonly labelKey: string;
}

/**
 * Convert generated AppEnum option metadata into Select options.
 *
 * Usage:
 *   import { CountryStatusOptions } from "@shared/types/generated";
 *   const options = enumOptions(CountryStatusOptions, t);
 */
export function enumOptions<T extends string | number>(
  options: readonly AppEnumOption<T>[],
  t: (key: string) => string,
): SelectOption[] {
  return options.map((option) => ({
    value: String(option.value),
    label: t(option.labelKey),
  }));
}

export function enumLabel<T extends string | number>(
  options: readonly AppEnumOption<T>[],
  value: T | null | undefined,
  t: (key: string) => string,
): string {
  const option = options.find((entry) => entry.value === value);
  return option ? t(option.labelKey) : String(value ?? "");
}

import { useCountryOptions } from "@shared/hooks/useCountryOptions";
import type { FieldBase } from "@shared/types/form";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "./Select";

export interface CountrySelectProps extends FieldBase {
  value?: string;
  onChange?: (iso2: string) => void;
  placeholder?: string;
  clearable?: boolean;
  filter?: (iso2: string) => boolean;
}

export function CountrySelect({
  value,
  onChange,
  filter,
  clearable = true,
  placeholder,
  ...rest
}: CountrySelectProps) {
  const { t } = useTranslation();
  const allOptions = useCountryOptions();
  const options = useMemo(
    () =>
      filter ? allOptions.filter((option) => filter(option.value)) : allOptions,
    [allOptions, filter],
  );

  return (
    <Select
      {...rest}
      value={value ?? ""}
      options={options}
      searchable
      clearable={clearable}
      onChange={(next) => {
        const resolved = Array.isArray(next) ? (next[0] ?? "") : next;
        onChange?.(resolved);
      }}
      placeholder={placeholder ?? t("Select a country...")}
    />
  );
}

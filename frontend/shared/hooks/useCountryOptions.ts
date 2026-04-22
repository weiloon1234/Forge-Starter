import { useRuntimeStore } from "@shared/config";
import type { SelectOption } from "@shared/types/form";
import { useMemo } from "react";

export type CountryOptionStyle = "name" | "calling_code";

export function useCountryOptions(
  style: CountryOptionStyle = "name",
): SelectOption[] {
  const countries = useRuntimeStore().countries;
  return useMemo(() => {
    return countries.map((country) => {
      const flag = country.flag_emoji ?? "";
      const callingCode = country.calling_code
        ? `+${country.calling_code.replace(/^\+/, "")}`
        : "";
      const trailing = style === "calling_code" ? callingCode : country.name;
      const label =
        [flag, trailing].filter(Boolean).join(" ").trim() || country.iso2;
      return { value: country.iso2, label };
    });
  }, [countries, style]);
}

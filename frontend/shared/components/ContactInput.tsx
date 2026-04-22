import { useCountryOptions } from "@shared/hooks/useCountryOptions";
import type { FieldBase } from "@shared/types/form";
import { useTranslation } from "react-i18next";
import { FieldMessages, fieldClasses } from "./FieldMessages";
import { Input } from "./Input";
import { Select } from "./Select";

interface ContactFieldBinding {
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  errors?: string[];
}

export interface ContactInputProps extends Omit<FieldBase, "errors" | "name"> {
  countryField: ContactFieldBinding;
  numberField: ContactFieldBinding;
  placeholder?: string;
}

export function ContactInput({
  countryField,
  numberField,
  label,
  hints,
  disabled,
  required,
  className,
  placeholder,
}: ContactInputProps) {
  const { t } = useTranslation();
  const countryOptions = useCountryOptions("calling_code");
  const combinedErrors = [
    ...(countryField.errors ?? []),
    ...(numberField.errors ?? []),
  ];
  const hasErrors = combinedErrors.length > 0;

  return (
    <div className={fieldClasses({ hasErrors, disabled, className })}>
      {label && (
        <div className={`sf-label${required ? " sf-label--required" : ""}`}>
          {label}
        </div>
      )}
      <div className="sf-contact">
        <Select
          name={countryField.name}
          value={countryField.value}
          options={countryOptions}
          searchable
          clearable={false}
          disabled={disabled}
          onChange={(next) => {
            const resolved = Array.isArray(next) ? (next[0] ?? "") : next;
            countryField.onChange(resolved);
          }}
          placeholder={t("+")}
        />
        <Input
          type="tel"
          name={numberField.name}
          value={numberField.value}
          disabled={disabled}
          onChange={(raw) => numberField.onChange(raw.replace(/\D+/g, ""))}
          onBlur={numberField.onBlur}
          placeholder={placeholder ?? t("Phone number")}
          maxLength={15}
        />
      </div>
      <FieldMessages hints={hints} errors={combinedErrors} />
    </div>
  );
}

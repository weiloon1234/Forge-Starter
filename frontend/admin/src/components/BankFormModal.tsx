import { Button, Input, Select } from "@shared/components";
import { useRuntimeStore } from "@shared/config";
import { useForm } from "@shared/hooks";
import { getLocaleLabel } from "@shared/i18n/localeLabels";
import { ModalBody, ModalFooter } from "@shared/modal";
import { toast } from "@shared/toast";
import type { AdminBankResponse } from "@shared/types/generated";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import {
  type BankFormValues,
  bankFormValuesFromResponse,
  bankNameFieldKey,
  buildBankPayload,
  emptyBankFormValues,
} from "@/bankForm";

interface BankFormModalProps {
  bankId?: string;
  onSaved?: () => void;
  onClose: () => void;
}

export function BankFormModal({
  bankId,
  onSaved,
  onClose,
}: BankFormModalProps) {
  const { t } = useTranslation();
  const { config, countries } = useRuntimeStore();
  const locales = useMemo(() => {
    const configured = config.locales.length > 0 ? config.locales : ["en"];
    return Array.from(new Set([config.default_locale, ...configured]));
  }, [config.default_locale, config.locales]);
  const defaultCountryIso2 = useMemo(
    () =>
      countries.find((country) => country.is_default)?.iso2 ??
      countries[0]?.iso2 ??
      "",
    [countries],
  );
  const countryOptions = useMemo(
    () =>
      countries.map((country) => ({
        value: country.iso2,
        label: country.flag_emoji
          ? `${country.flag_emoji} ${country.name}`
          : country.name,
      })),
    [countries],
  );
  const [activeLocale, setActiveLocale] = useState(config.default_locale);
  const [loading, setLoading] = useState(Boolean(bankId));
  const isCreate = !bankId;

  const form = useForm<BankFormValues>({
    initialValues: emptyBankFormValues(locales, defaultCountryIso2),
    onSubmit: async (values) => {
      const payload = buildBankPayload(values, locales);

      if (isCreate) {
        await api.post<AdminBankResponse>("/banks", payload);
        toast.success(t("Bank created"));
      } else {
        await api.put<AdminBankResponse>(`/banks/${bankId}`, payload);
        toast.success(t("Bank updated"));
      }

      onSaved?.();
      onClose();
    },
  });
  const { setValues } = form;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!bankId) {
        setValues(emptyBankFormValues(locales, defaultCountryIso2));
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data } = await api.get<AdminBankResponse>(`/banks/${bankId}`);
        if (!active) {
          return;
        }
        setValues(bankFormValuesFromResponse(data, locales));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [bankId, defaultCountryIso2, locales, setValues]);

  const countryField = form.field("country_iso2");
  const nameField = form.field(
    bankNameFieldKey(activeLocale) as keyof BankFormValues,
  );
  const activeLocaleLabel = getLocaleLabel(activeLocale, t);

  return (
    <>
      <ModalBody>
        <div className="sf-admin-form-page">
          {loading ? (
            <div className="sf-page-subtitle">{t("Loading")}</div>
          ) : (
            <>
              {form.formErrors.length > 0 && (
                <div className="sf-form-error-banner">
                  {form.formErrors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              )}

              <div className="sf-admin-form">
                <div className="sf-admin-form-section">
                  <div className="sf-admin-form-section__header">
                    <h2>{t("Details")}</h2>
                  </div>

                  <Select
                    name={countryField.name}
                    label={t("Country")}
                    value={
                      typeof countryField.value === "string"
                        ? countryField.value
                        : ""
                    }
                    options={countryOptions}
                    onChange={(value) => {
                      const picked = Array.isArray(value)
                        ? (value[0] ?? "")
                        : value;
                      countryField.onChange(picked);
                    }}
                    errors={countryField.errors}
                  />

                  <div className="sf-page-locale-tabs" role="tablist">
                    {locales.map((locale) => (
                      <Button
                        key={locale}
                        type="button"
                        unstyled
                        className={`sf-page-locale-tab${locale === activeLocale ? " sf-page-locale-tab--active" : ""}`}
                        onClick={() => setActiveLocale(locale)}
                        ariaLabel={getLocaleLabel(locale, t)}
                        title={getLocaleLabel(locale, t)}
                      >
                        {getLocaleLabel(locale, t)}
                      </Button>
                    ))}
                  </div>

                  <div className="sf-page-locale-panel">
                    <div className="sf-page-locale-panel__header">
                      {t("Locale content for {{locale}}", {
                        locale: activeLocaleLabel,
                      })}
                    </div>

                    <Input
                      name={nameField.name}
                      label={t("Name")}
                      value={
                        typeof nameField.value === "string"
                          ? nameField.value
                          : ""
                      }
                      onChange={nameField.onChange}
                      onBlur={nameField.onBlur}
                      errors={nameField.errors}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          busy={form.busy}
          disabled={loading}
          onClick={() => void form.handleSubmit()}
        >
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}

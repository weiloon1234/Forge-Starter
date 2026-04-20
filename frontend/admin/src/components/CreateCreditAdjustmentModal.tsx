import { Button, Input, Select } from "@shared/components";
import { useRuntimeStore } from "@shared/config";
import { useForm } from "@shared/hooks";
import { getLocaleLabel } from "@shared/i18n/localeLabels";
import { ModalBody, ModalFooter } from "@shared/modal";
import type {
  AdminCreditAdjustmentResponse,
  AdminUserLookupOptionResponse,
} from "@shared/types/generated";
import { CreditTypeOptions } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import {
  balanceForCreditType,
  buildCreateCreditAdjustmentPayload,
  type CreditAdjustmentFormValues,
  creditOperationOptions,
  creditTypeOptions,
  creditTypeValue,
  emptyCreditAdjustmentFormValues,
  explanationOverrideFieldKey,
  operationValue,
  projectedBalance,
  resolveExplanationPreview,
  userOptionLabel,
} from "@/credits";

const FORM_ID = "credit-adjustment-form";

interface CreateCreditAdjustmentModalProps {
  onSaved?: () => void;
  onClose: () => void;
}

export function CreateCreditAdjustmentModal({
  onSaved,
  onClose,
}: CreateCreditAdjustmentModalProps) {
  const { t } = useTranslation();
  const { config } = useRuntimeStore();
  const locales = useMemo(() => {
    const configured = config.locales.length > 0 ? config.locales : ["en"];
    return Array.from(new Set([config.default_locale, ...configured]));
  }, [config.default_locale, config.locales]);
  const [activeLocale, setActiveLocale] = useState(config.default_locale);
  const [userOptions, setUserOptions] = useState<
    AdminUserLookupOptionResponse[]
  >([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedUser, setSelectedUser] =
    useState<AdminUserLookupOptionResponse | null>(null);

  const form = useForm<CreditAdjustmentFormValues>({
    initialValues: emptyCreditAdjustmentFormValues(locales),
    onSubmit: async (values) => {
      try {
        const payload = buildCreateCreditAdjustmentPayload(values, locales);
        await api.post<AdminCreditAdjustmentResponse>(
          "/credits/adjustments",
          payload,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "invalid_context") {
          form.setFieldError("context_json", [
            t("admin.credits.errors.invalid_context_json"),
          ]);
          return;
        }
        throw error;
      }

      toast.success(t("admin.credits.created"));
      onSaved?.();
      onClose();
    },
  });

  const fetchUsers = useCallback(
    async (query = "") => {
      setOptionsLoading(true);
      try {
        const { data } = await api.get<AdminUserLookupOptionResponse[]>(
          "/credits/users/options",
          {
            params: query.trim() === "" ? undefined : { q: query.trim() },
          },
        );
        setUserOptions(() => {
          if (!selectedUser) {
            return data;
          }
          return data.some((user) => user.id === selectedUser.id)
            ? data
            : [selectedUser, ...data];
        });
      } finally {
        setOptionsLoading(false);
      }
    },
    [selectedUser],
  );

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const userField = form.field("user_id");
  const creditTypeField = form.field("credit_type");
  const operationField = form.field("operation");
  const amountField = form.field("amount");
  const remarkField = form.field("remark");
  const relatedKeyField = form.field("related_key");
  const relatedTypeField = form.field("related_type");
  const contextField = form.field("context_json");
  const overrideField = form.field(
    explanationOverrideFieldKey(
      activeLocale,
    ) as keyof CreditAdjustmentFormValues,
  );

  const currentCreditType = creditTypeValue(form.values);
  const currentOperation = operationValue(form.values);
  const currentBalance = balanceForCreditType(selectedUser, currentCreditType);
  const nextBalance = projectedBalance(
    currentBalance,
    String(amountField.value ?? ""),
    currentOperation,
  );
  const explanationPreview = resolveExplanationPreview(
    form.values,
    activeLocale,
    t,
  );
  const localeLabel = getLocaleLabel(activeLocale, t);
  const userSelectOptions = useMemo(
    () =>
      userOptions.map((user) => ({
        value: user.id,
        label: userOptionLabel(user),
      })),
    [userOptions],
  );

  return (
    <>
      <ModalBody>
        <div className="sf-admin-form-page">
          <div>
            <h3 className="sf-page-title">{t("admin.credits.create_title")}</h3>
            <p className="sf-page-subtitle">{t("admin.credits.create_help")}</p>
          </div>

          {form.formErrors.length > 0 && (
            <div className="sf-form-error-banner">
              {form.formErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          <form
            id={FORM_ID}
            className="sf-admin-form"
            onSubmit={form.handleSubmit}
          >
            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.credits.sections.adjustment")}</h2>
                <p>{t("admin.credits.sections.adjustment_help")}</p>
              </div>

              <Select
                name={userField.name}
                label={t("admin.credits.fields.user")}
                value={
                  typeof userField.value === "string" ? userField.value : ""
                }
                options={userSelectOptions}
                searchable
                loading={optionsLoading}
                onSearch={(query) => fetchUsers(query)}
                onChange={(value) => {
                  const nextValue = Array.isArray(value)
                    ? (value[0] ?? "")
                    : value;
                  userField.onChange(nextValue);
                  const nextUser =
                    userOptions.find((user) => user.id === nextValue) ?? null;
                  setSelectedUser(nextUser);
                }}
                errors={userField.errors}
                placeholder={t("admin.credits.user_placeholder")}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Select
                  name={creditTypeField.name}
                  label={t("admin.credits.fields.credit_type")}
                  value={
                    typeof creditTypeField.value === "string"
                      ? creditTypeField.value
                      : currentCreditType
                  }
                  options={creditTypeOptions(t)}
                  onChange={(value) =>
                    creditTypeField.onChange(
                      (Array.isArray(value)
                        ? (value[0] ?? "credit_1")
                        : value) as CreditAdjustmentFormValues["credit_type"],
                    )
                  }
                  errors={creditTypeField.errors}
                />

                <Select
                  name={operationField.name}
                  label={t("admin.credits.fields.operation")}
                  value={
                    typeof operationField.value === "string"
                      ? operationField.value
                      : currentOperation
                  }
                  options={creditOperationOptions(t)}
                  onChange={(value) =>
                    operationField.onChange(
                      (Array.isArray(value)
                        ? (value[0] ?? "add")
                        : value) as CreditAdjustmentFormValues["operation"],
                    )
                  }
                  errors={operationField.errors}
                />

                <Input
                  name={amountField.name}
                  label={t("admin.credits.fields.amount")}
                  value={
                    typeof amountField.value === "string"
                      ? amountField.value
                      : ""
                  }
                  onChange={amountField.onChange}
                  onBlur={amountField.onBlur}
                  errors={amountField.errors}
                  placeholder={t("admin.credits.amount_placeholder")}
                  hints={[t("admin.credits.amount_hint")]}
                />
              </div>

              {selectedUser && (
                <div className="sf-page-locale-panel">
                  <div className="sf-page-locale-panel__header">
                    {selectedUser.label}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="sf-page-subtitle">
                        {t("admin.credits.current_balance_label", {
                          credit_type: enumLabel(
                            CreditTypeOptions,
                            currentCreditType,
                            t,
                          ),
                        })}
                      </div>
                      <div>{currentBalance}</div>
                    </div>
                    <div>
                      <div className="sf-page-subtitle">
                        {t("admin.credits.projected_balance_label")}
                      </div>
                      <div>{nextBalance ?? "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.credits.sections.explanation")}</h2>
                <p>{t("admin.credits.sections.explanation_help")}</p>
              </div>

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
                  {t("admin.credits.override_panel_title", {
                    locale: localeLabel,
                  })}
                </div>

                <Input
                  name={overrideField.name}
                  label={t("admin.credits.fields.explanation_override")}
                  value={
                    typeof overrideField.value === "string"
                      ? overrideField.value
                      : ""
                  }
                  onChange={overrideField.onChange}
                  onBlur={overrideField.onBlur}
                  errors={overrideField.errors}
                  hints={[t("admin.credits.override_hint")]}
                />

                <div className="sf-page-subtitle">
                  {t("admin.credits.preview_label")}
                </div>
                <div>{explanationPreview}</div>
              </div>
            </div>

            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.credits.sections.trace")}</h2>
                <p>{t("admin.credits.sections.trace_help")}</p>
              </div>

              <Input
                name={remarkField.name}
                type="textarea"
                label={t("admin.credits.fields.remark")}
                value={
                  typeof remarkField.value === "string" ? remarkField.value : ""
                }
                onChange={remarkField.onChange}
                onBlur={remarkField.onBlur}
                errors={remarkField.errors}
                rows={3}
                hints={[t("admin.credits.remark_hint")]}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  name={relatedTypeField.name}
                  label={t("admin.credits.fields.related_type")}
                  value={
                    typeof relatedTypeField.value === "string"
                      ? relatedTypeField.value
                      : ""
                  }
                  onChange={relatedTypeField.onChange}
                  onBlur={relatedTypeField.onBlur}
                  errors={relatedTypeField.errors}
                  hints={[t("admin.credits.related_type_hint")]}
                />

                <Input
                  name={relatedKeyField.name}
                  label={t("admin.credits.fields.related_key")}
                  value={
                    typeof relatedKeyField.value === "string"
                      ? relatedKeyField.value
                      : ""
                  }
                  onChange={relatedKeyField.onChange}
                  onBlur={relatedKeyField.onBlur}
                  errors={relatedKeyField.errors}
                  hints={[t("admin.credits.related_key_hint")]}
                />
              </div>

              <Input
                name={contextField.name}
                type="textarea"
                label={t("admin.credits.fields.context")}
                value={
                  typeof contextField.value === "string"
                    ? contextField.value
                    : ""
                }
                onChange={contextField.onChange}
                onBlur={contextField.onBlur}
                errors={contextField.errors}
                rows={5}
                hints={[t("admin.credits.context_hint")]}
              />
            </div>
          </form>
        </div>
      </ModalBody>

      <ModalFooter>
        <div />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            size="sm"
            busy={form.busy}
          >
            {t("Save")}
          </Button>
        </div>
      </ModalFooter>
    </>
  );
}

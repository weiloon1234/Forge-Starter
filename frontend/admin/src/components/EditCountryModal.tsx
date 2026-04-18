import { Button, Checkbox, Input, Select } from "@shared/components";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter } from "@shared/modal";
import type {
  CountryStatus,
  UpdateCountryRequest,
} from "@shared/types/generated";
import { CountryStatusValues } from "@shared/types/generated";
import { enumOptions } from "@shared/utils/enumOptions";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";

interface EditCountryModalProps {
  iso2: string;
  status: CountryStatus;
  conversionRate: number | null;
  isDefault: boolean;
  onClose: () => void;
}

export function EditCountryModal({
  iso2,
  status,
  conversionRate,
  isDefault,
  onClose,
}: EditCountryModalProps) {
  const { t } = useTranslation();
  const defaultToggleDisabled = isDefault;

  const form = useForm<UpdateCountryRequest>({
    initialValues: {
      status,
      conversion_rate: conversionRate,
      is_default: isDefault,
    },
    onSubmit: async (values) => {
      await api.put(`/countries/${iso2}`, values);
      toast.success(t("Country updated"));
      onClose();
    },
  });
  const statusField = form.field("status");
  const conversionRateField = form.field("conversion_rate");
  const defaultField = form.field("is_default");

  return (
    <>
      <ModalBody>
        <Select
          name={statusField.name}
          value={statusField.value}
          label={t("Status")}
          options={enumOptions(CountryStatusValues, t)}
          onChange={(value) => {
            if (typeof value === "string") {
              statusField.onChange(value as CountryStatus);
            }
          }}
          errors={statusField.errors}
        />
        <Input
          name={conversionRateField.name}
          type="money"
          label={t("Conversion rate")}
          value={conversionRateField.value?.toString() ?? ""}
          placeholder="0.00"
          errors={conversionRateField.errors}
          onBlur={conversionRateField.onBlur}
          onChange={(value) => {
            if (value === "") {
              conversionRateField.onChange(null);
              return;
            }

            const parsed = Number(value);
            conversionRateField.onChange(
              Number.isFinite(parsed) ? parsed : null,
            );
          }}
        />
        <Checkbox
          name={defaultField.name}
          checked={!!defaultField.value}
          label={t("Set as default")}
          hints={
            defaultToggleDisabled
              ? [
                  t(
                    "Choose another country as default before clearing this one.",
                  ),
                ]
              : [
                  t(
                    "Setting this country as default will clear the previous default.",
                  ),
                ]
          }
          errors={defaultField.errors}
          disabled={defaultToggleDisabled}
          onChange={(checked) => defaultField.onChange(checked)}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          busy={form.busy}
          onClick={form.handleSubmit}
        >
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}

import { useTranslation } from "react-i18next";
import { useForm } from "@shared/hooks";
import { Input, Select, Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { enumOptions } from "@shared/utils/enumOptions";
import { api } from "@/api";
import { toast } from "sonner";
import { CountryStatusValues } from "@shared/types/generated";
import type { CountryStatus } from "@shared/types/generated";

interface EditCountryModalProps {
  iso2: string;
  name: string;
  status: CountryStatus;
  conversionRate: number | null;
  onClose: () => void;
}

export function EditCountryModal({ iso2, status, conversionRate, onClose }: EditCountryModalProps) {
  const { t } = useTranslation();

  const form = useForm<{ status: string; conversion_rate: string }>({
    initialValues: {
      status,
      conversion_rate: conversionRate?.toString() ?? "",
    },
    onSubmit: async (values) => {
      const rate = values.conversion_rate ? parseFloat(values.conversion_rate) : null;
      await api.put(`/countries/${iso2}`, {
        status: values.status,
        conversion_rate: rate,
      });
      toast.success(t("Country updated"));
      onClose();
    },
  });

  return (
    <>
      <ModalBody>
        <Select
          {...form.field("status")}
          label={t("Status")}
          options={enumOptions(CountryStatusValues, t)}
        />
        <Input
          {...form.field("conversion_rate")}
          type="number"
          label={t("Conversion Rate")}
          placeholder="0.00"
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button variant="primary" size="sm" busy={form.busy} onClick={form.handleSubmit}>
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}

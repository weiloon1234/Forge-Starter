import { Button, Input } from "@shared/components";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter } from "@shared/modal";
import type { ChangeAdminPasswordRequest } from "@shared/types/generated";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const { t } = useTranslation();

  const form = useForm<ChangeAdminPasswordRequest>({
    initialValues: {
      current_password: "",
      password: "",
      password_confirmation: "",
    },
    onSubmit: async (values) => {
      await api.put("/profile/password", values);
      toast.success(t("Password changed"));
      onClose();
    },
  });

  return (
    <>
      <ModalBody>
        <Input
          {...form.field("current_password")}
          type="password"
          label={t("Current password")}
          autoFocus
        />
        <Input
          {...form.field("password")}
          type="password"
          label={t("New password")}
        />
        <Input
          {...form.field("password_confirmation")}
          type="password"
          label={t("Confirm new password")}
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

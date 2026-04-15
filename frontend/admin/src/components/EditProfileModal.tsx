import { useTranslation } from "react-i18next";
import { useForm } from "@shared/hooks";
import { Input, Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { api } from "@/api";
import { auth } from "@/auth";
import { toast } from "sonner";
import type { UpdateAdminProfileRequest } from "@shared/types/generated";

interface EditProfileModalProps {
  name: string;
  email: string;
  onClose: () => void;
}

export function EditProfileModal({ name, email, onClose }: EditProfileModalProps) {
  const { t } = useTranslation();

  const form = useForm<UpdateAdminProfileRequest>({
    initialValues: { name, email, current_password: "" },
    onSubmit: async (values) => {
      await api.put("/profile", values);
      toast.success(t("Profile updated"));
      await auth.fetchMe();
      onClose();
    },
  });

  return (
    <>
      <ModalBody>
        <Input {...form.field("name")} label={t("Name")} autoFocus />
        <Input {...form.field("email")} type="email" label={t("Email")} />
        <Input
          {...form.field("current_password")}
          type="password"
          label={t("Current password")}
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

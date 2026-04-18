import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmDeleteAdminModalProps {
  name: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDeleteAdminModal({
  name,
  onConfirm,
  onClose,
}: ConfirmDeleteAdminModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ModalBody>
        <p>{t("admin.admins.confirm_delete", { name })}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </Button>
        <Button variant="danger" size="sm" busy={busy} onClick={handleConfirm}>
          {t("Delete")}
        </Button>
      </ModalFooter>
    </>
  );
}

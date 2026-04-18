import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmDeleteLogModalProps {
  filename: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDeleteLogModal({
  filename,
  onConfirm,
  onClose,
}: ConfirmDeleteLogModalProps) {
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
        <p>{t("confirm_delete_log", { filename })}</p>
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

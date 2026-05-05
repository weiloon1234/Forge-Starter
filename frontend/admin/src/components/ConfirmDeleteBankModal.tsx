import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { useTranslation } from "react-i18next";

interface ConfirmDeleteBankModalProps {
  name: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDeleteBankModal({
  name,
  onConfirm,
  onClose,
}: ConfirmDeleteBankModalProps) {
  const { t } = useTranslation();

  return (
    <>
      <ModalBody>
        <p className="sf-page-modal-note">
          {t("Delete {{name}}? This action cannot be undone.", { name })}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            void onConfirm();
          }}
        >
          {t("Delete")}
        </Button>
      </ModalFooter>
    </>
  );
}

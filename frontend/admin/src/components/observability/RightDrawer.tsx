import { Button } from "@shared/components";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface RightDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function RightDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: RightDrawerProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="sf-obs-drawer">
      <Button
        type="button"
        unstyled
        ariaLabel={t("Close")}
        className="sf-obs-drawer__backdrop"
        onClick={onClose}
      />
      <aside className="sf-obs-drawer__panel">
        <header className="sf-obs-drawer__header">
          <div>
            <h2 className="sf-obs-drawer__title">{title}</h2>
            {subtitle && <p className="sf-obs-drawer__subtitle">{subtitle}</p>}
          </div>
          <Button
            type="button"
            unstyled
            ariaLabel={t("Close")}
            className="sf-obs-drawer__close"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </header>
        <div className="sf-obs-drawer__body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

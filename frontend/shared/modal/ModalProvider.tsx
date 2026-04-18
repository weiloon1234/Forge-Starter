import { useStore } from "@shared/store/createStore";
import { X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { modal, modalStore } from "./store";

const Z_BASE = 1000;

export function ModalProvider() {
  const { t } = useTranslation();
  const { stack } = useStore(modalStore);

  // Escape closes top-most
  useEffect(() => {
    if (stack.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") modal.close();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [stack.length]);

  // Lock body scroll
  useEffect(() => {
    if (stack.length > 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [stack.length]);

  if (stack.length === 0) return null;

  return (
    <>
      {stack.map((entry, index) => {
        const zIndex = Z_BASE + index * 10;
        const Component = entry.component as ComponentType<
          Record<string, unknown> & {
            onClose: () => void;
          }
        >;
        const isTop = index === stack.length - 1;

        const handleClose = () => modal.close(entry.id);

        return (
          <div key={entry.id} className="sf-modal-overlay" style={{ zIndex }}>
            <button
              type="button"
              className="sf-modal-backdrop"
              onClick={handleClose}
              aria-label={t("Close")}
              disabled={!isTop}
            />
            <div className="sf-modal-container">
              {entry.title && (
                <div className="sf-modal-header">
                  <h2 className="sf-modal-header-title">{entry.title}</h2>
                  <button
                    type="button"
                    className="sf-modal-close"
                    onClick={handleClose}
                    aria-label={t("Close")}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <Component {...(entry.props ?? {})} onClose={handleClose} />
            </div>
          </div>
        );
      })}
    </>
  );
}

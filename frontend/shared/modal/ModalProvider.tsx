import { useEffect } from "react";
import { useStore } from "../store/createStore";
import { modalStore, modal } from "./store";
import { X } from "lucide-react";

const Z_BASE = 1000;

export function ModalProvider() {
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
        const Component = entry.component;
        const isTop = index === stack.length - 1;

        const handleClose = () => modal.close(entry.id);

        return (
          <div
            key={entry.id}
            className="sf-modal-overlay"
            style={{ zIndex }}
            onClick={(e) => {
              if (e.target === e.currentTarget && isTop) {
                handleClose();
              }
            }}
          >
            <div className="sf-modal-container">
              {entry.title && (
                <div className="sf-modal-header">
                  <h2 className="sf-modal-header-title">{entry.title}</h2>
                  <button
                    type="button"
                    className="sf-modal-close"
                    onClick={handleClose}
                    aria-label="Close"
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

import { createStore } from "../store/createStore";
import type { ComponentType } from "react";
import type { ModalEntry, ModalState } from "./types";

let counter = 0;

const store = createStore<ModalState>({ stack: [] });

export const modal = {
  /**
   * Open a modal. Returns the modal ID for targeted close.
   *
   *   const id = modal.open(ConfirmDialog, { title: "Sure?" });
   *   modal.close(id);
   */
  open<P extends Record<string, any>>(
    component: ComponentType<P & { onClose: () => void }>,
    props?: Omit<P, "onClose">,
    options?: { onClose?: () => void }
  ): string {
    const id = `modal-${++counter}`;
    const entry: ModalEntry = {
      id,
      component,
      props,
      onClose: options?.onClose,
    };
    store.setState((prev) => ({
      stack: [...prev.stack, entry],
    }));
    return id;
  },

  /** Close by ID, or close the top-most if no ID. */
  close(id?: string) {
    store.setState((prev) => {
      if (prev.stack.length === 0) return prev;

      let closing: ModalEntry | undefined;
      let nextStack: ModalEntry[];

      if (id) {
        closing = prev.stack.find((m) => m.id === id);
        nextStack = prev.stack.filter((m) => m.id !== id);
      } else {
        closing = prev.stack[prev.stack.length - 1];
        nextStack = prev.stack.slice(0, -1);
      }

      closing?.onClose?.();
      return { stack: nextStack };
    });
  },

  /** Close all modals. */
  closeAll() {
    const { stack } = store.getState();
    stack.forEach((m) => m.onClose?.());
    store.setState({ stack: [] });
  },

  /** Get current stack length. */
  get count() {
    return store.getState().stack.length;
  },
};

// Internal — used by ModalProvider
export { store as modalStore };

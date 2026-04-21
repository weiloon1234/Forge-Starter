import { createStore } from "@shared/store/createStore";
import type { ComponentType } from "react";
import type {
  ModalComponentProps,
  ModalEntry,
  ModalOptions,
  ModalProps,
  ModalState,
} from "./types";

let counter = 0;

const store = createStore<ModalState>({ stack: [] });

export const modal = {
  /**
   * Open a modal. Returns the modal ID for targeted close.
   *
   *   modal.open(EditProfile, { name: "Wei" }, { title: "My Profile" });
   *   modal.open(ConfirmDialog, { message: "Sure?" });
   */
  open<P extends ModalProps>(
    component: ComponentType<P & ModalComponentProps>,
    props?: Omit<P, "onClose">,
    options?: ModalOptions,
  ): string {
    const id = `modal-${++counter}`;
    const entry: ModalEntry = {
      id,
      component: component as ComponentType<ModalComponentProps>,
      props: props as ModalProps | undefined,
      title: options?.title,
      onClose: options?.onClose,
      containerClassName: options?.containerClassName,
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
    stack.forEach((m) => {
      m.onClose?.();
    });
    store.setState({ stack: [] });
  },

  /** Get current stack length. */
  get count() {
    return store.getState().stack.length;
  },
};

// Internal — used by ModalProvider
export { store as modalStore };

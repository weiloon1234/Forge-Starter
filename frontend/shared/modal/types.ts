import type { ComponentType, ReactNode } from "react";

export interface ModalOptions {
  title?: ReactNode;
  onClose?: () => void;
}

export interface ModalEntry {
  id: string;
  component: ComponentType<any>;
  props?: Record<string, any>;
  title?: ReactNode;
  onClose?: () => void;
}

export interface ModalState {
  stack: ModalEntry[];
}

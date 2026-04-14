import type { ComponentType } from "react";

export interface ModalEntry {
  id: string;
  component: ComponentType<any>;
  props?: Record<string, any>;
  onClose?: () => void;
}

export interface ModalState {
  stack: ModalEntry[];
}

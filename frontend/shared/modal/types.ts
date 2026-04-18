import type { ComponentType, ReactNode } from "react";

export interface ModalComponentProps {
  onClose: () => void;
}

export type ModalProps = object;

export interface ModalOptions {
  title?: ReactNode;
  onClose?: () => void;
}

export interface ModalEntry {
  id: string;
  component: ComponentType<ModalComponentProps>;
  props?: ModalProps;
  title?: ReactNode;
  onClose?: () => void;
}

export interface ModalState {
  stack: ModalEntry[];
}

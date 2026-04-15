import type { ReactNode } from "react";

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={`sf-modal-body ${className ?? ""}`}>
      {children}
    </div>
  );
}

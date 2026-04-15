import type { ReactNode } from "react";

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={`sf-modal-footer ${className ?? ""}`}>
      {children}
    </div>
  );
}

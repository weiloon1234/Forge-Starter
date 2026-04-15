import type { ReactNode } from "react";

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={className ? `sf-modal-footer ${className}` : "sf-modal-footer"}>
      {children}
    </div>
  );
}

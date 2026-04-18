import { ModalBody } from "@shared/modal";
import type { LogEntryResponse } from "@shared/types/generated";

interface LogEntryModalProps {
  entry: LogEntryResponse;
  onClose: () => void;
}

export function LogEntryModal({ entry }: LogEntryModalProps) {
  return (
    <ModalBody>
      <pre className="sf-log-pre">{JSON.stringify(entry.raw, null, 2)}</pre>
    </ModalBody>
  );
}

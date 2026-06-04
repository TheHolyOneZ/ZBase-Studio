import { AlertTriangle } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";

interface ConfirmDropModalProps {
  open: boolean;
  kind: "table" | "column";
  name: string;
  rowCount?: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDropModal({
  open,
  kind,
  name,
  rowCount,
  onConfirm,
  onCancel,
}: ConfirmDropModalProps) {
  const hasRows = typeof rowCount === "number" && rowCount > 0;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={kind === "table" ? "Drop table?" : "Drop column?"}
      width={420}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Drop {kind === "table" ? "table" : "column"}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <AlertTriangle
          size={20}
          className="shrink-0 mt-0.5"
          style={{ color: "var(--warning)" }}
        />
        <div className="text-sm space-y-2" style={{ color: "var(--fg-muted)" }}>
          <p>
            Drop <span className="font-mono font-semibold" style={{ color: "var(--fg-0)" }}>{name}</span>?
            {" "}This action will be auto-saved immediately.
          </p>
          {hasRows && (
            <p style={{ color: "var(--warning)" }}>
              <strong>Warning:</strong> This {kind} contains approximately{" "}
              <strong>{rowCount?.toLocaleString()}</strong> row{rowCount !== 1 ? "s" : ""} of data.
              {" "}Undo restores structure but <em>not</em> the data.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { SelectInput } from "../common/FormControls";
import type { FkAction } from "../../types/builder";

const FK_ACTIONS: FkAction[] = ["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"];
const FK_OPTIONS = FK_ACTIONS.map((a) => ({ value: a, label: a }));

interface FkEditModalProps {
  sourceTable: string;
  sourceCol: string;
  targetTable: string;
  targetCol: string;
  initialOnDelete: FkAction;
  initialOnUpdate: FkAction;
  onConfirm: (onDelete: FkAction, onUpdate: FkAction) => void;
  onCancel: () => void;
}

export default function FkEditModal({
  sourceTable,
  sourceCol,
  targetTable,
  targetCol,
  initialOnDelete,
  initialOnUpdate,
  onConfirm,
  onCancel,
}: FkEditModalProps) {
  const [onDelete, setOnDelete] = useState<FkAction>(initialOnDelete);
  const [onUpdate, setOnUpdate] = useState<FkAction>(initialOnUpdate);

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Edit Foreign Key"
      width={400}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(onDelete, onUpdate)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm" style={{ color: "var(--fg-muted)" }}>
        <p>
          <span className="font-mono font-semibold" style={{ color: "var(--fg-0)" }}>
            {sourceTable}.{sourceCol}
          </span>
          {" → "}
          <span className="font-mono font-semibold" style={{ color: "var(--fg-0)" }}>
            {targetTable}.{targetCol}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>ON DELETE</span>
            <SelectInput<FkAction> value={onDelete} onChange={setOnDelete} options={FK_OPTIONS} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>ON UPDATE</span>
            <SelectInput<FkAction> value={onUpdate} onChange={setOnUpdate} options={FK_OPTIONS} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

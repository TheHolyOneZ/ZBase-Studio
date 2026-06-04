import { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { SelectInput } from "../common/FormControls";
import type { FkAction } from "../../types/builder";
import type { Connection } from "@xyflow/react";

const FK_ACTIONS: FkAction[] = ["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"];
const FK_OPTIONS = FK_ACTIONS.map((a) => ({ value: a, label: a }));

interface FkPopoverProps {
  connection: Connection;
  onConfirm: (connection: Connection, onDelete: FkAction, onUpdate: FkAction) => void;
  onCancel: () => void;
}

function colName(handle: string | null | undefined): string {
  if (!handle) return "?";
  return handle.replace(/^(src|tgt):col:/, "");
}

export default function FkPopover({ connection, onConfirm, onCancel }: FkPopoverProps) {
  const [onDelete, setOnDelete] = useState<FkAction>("NO ACTION");
  const [onUpdate, setOnUpdate] = useState<FkAction>("NO ACTION");

  const srcCol = colName(connection.sourceHandle);
  const tgtCol = colName(connection.targetHandle);

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Add Foreign Key"
      width={400}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onConfirm(connection, onDelete, onUpdate)}
          >
            Add FK
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm" style={{ color: "var(--fg-muted)" }}>
        <p>
          <span className="font-mono font-semibold" style={{ color: "var(--fg-0)" }}>
            {connection.source}.{srcCol}
          </span>
          {" → "}
          <span className="font-mono font-semibold" style={{ color: "var(--fg-0)" }}>
            {connection.target}.{tgtCol}
          </span>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>ON DELETE</span>
            <SelectInput<FkAction>
              value={onDelete}
              onChange={setOnDelete}
              options={FK_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>ON UPDATE</span>
            <SelectInput<FkAction>
              value={onUpdate}
              onChange={setOnUpdate}
              options={FK_OPTIONS}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

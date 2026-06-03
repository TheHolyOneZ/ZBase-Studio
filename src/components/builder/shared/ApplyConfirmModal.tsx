import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { DestructiveOp } from "../../../types/builderShared";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import { Checkbox } from "../../common/FormControls";

interface Props {
  destructive: DestructiveOp[];
  sql: string;
  onConfirm: () => void;
  onCancel: () => void;
  caveat?: ReactNode;
  applying?: boolean;
}

export default function ApplyConfirmModal({ destructive, sql, onConfirm, onCancel, caveat, applying }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal open title="Confirm destructive changes" onClose={onCancel} width={560}>
      <div className="flex flex-col gap-3" style={{ maxWidth: 560 }}>
        {destructive.length > 0 && (
          <div
            className="flex items-start gap-2 p-3 rounded"
            style={{ background: "rgba(224,60,0,0.08)", border: "1px solid rgba(224,60,0,0.25)" }}
          >
            <AlertTriangle size={14} style={{ color: "#E03C00", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: "#E03C00" }}>
                The following destructive operations will run:
              </p>
              {destructive.map((op, i) => (
                <p key={i} className="text-[11px]" style={{ color: "#E03C00" }}>• {op.message}</p>
              ))}
            </div>
          </div>
        )}

        {caveat && (
          <div
            className="flex items-start gap-2 p-3 rounded"
            style={{ background: "rgba(180,120,0,0.08)", border: "1px solid rgba(180,120,0,0.25)" }}
          >
            <AlertTriangle size={14} style={{ color: "#B47800", flexShrink: 0, marginTop: 1 }} />
            <p className="text-[11px]" style={{ color: "#B47800" }}>{caveat}</p>
          </div>
        )}

        <div>
          <p className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>SQL that will execute:</p>
          <pre
            className="text-[11px] p-2 rounded overflow-auto"
            style={{ background: "var(--bg-0)", border: "1px solid var(--border)", maxHeight: 200, color: "var(--fg-0)" }}
          >{sql}</pre>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
          <Checkbox checked={confirmed} onChange={setConfirmed} disabled={applying} />
          I understand these changes may delete data and cannot be undone automatically.
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={applying}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={!confirmed || applying}
            style={confirmed && !applying ? { background: "#E03C00", borderColor: "#E03C00" } : undefined}
          >
            {applying ? <><Loader2 size={11} className="animate-spin" /> Applying…</> : "Apply anyway"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

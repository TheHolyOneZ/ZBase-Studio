import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { useStore } from "../../store";
import { executeDdl, getDbSchema } from "../../ipc/commands";
import { extractError } from "../../lib/extractError";
import {
  draftFromSchema,
  generateAlterSql,
  type ColumnDraft,
  type TableDraft,
} from "../../lib/schemaEdit";
import type { TableSchema } from "../../types/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  tabId: string;
  table: TableSchema;
}

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  padding: "2px 6px",
  borderRadius: "var(--r-sm)",
  fontSize: 11,
  outline: "none",
};

function ColInput(props: React.InputHTMLAttributes<HTMLInputElement> & { style?: React.CSSProperties }) {
  const { style, ...rest } = props;
  return (
    <input
      {...rest}
      style={{ ...INPUT_STYLE, ...style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; props.onBlur?.(e); }}
    />
  );
}

export default function EditTableModal({ open, onClose, tabId, table }: Props) {
  const { addToast, setSchema } = useStore();
  const [draft, setDraft] = useState<TableDraft>(() => draftFromSchema(table));
  const [busy, setBusy] = useState(false);


  useEffect(() => {
    setDraft(draftFromSchema(table));
  }, [table.name]);

  const sql = generateAlterSql(table, draft);
  const noChanges = sql === "-- No changes";

  function setTableName(newName: string) {
    setDraft((d) => ({ ...d, newName }));
  }

  function updateCol(idx: number, patch: Partial<ColumnDraft>) {
    setDraft((d) => {
      const columns = d.columns.map((c, i) => i === idx ? { ...c, ...patch } : c);
      return { ...d, columns };
    });
  }

  function addColumn() {
    setDraft((d) => ({
      ...d,
      columns: [
        ...d.columns,
        {
          originalName: null,
          name: "",
          type: "TEXT",
          notNull: false,
          pk: 0,
          unique: false,
          defaultExpr: null,
        },
      ],
    }));
  }

  function removeColumn(idx: number) {
    setDraft((d) => ({
      ...d,
      columns: d.columns.filter((_, i) => i !== idx),
    }));
  }

  async function handleApply() {
    if (noChanges) return;
    setBusy(true);
    try {
      await executeDdl(tabId, sql);
      const schema = await getDbSchema(tabId);
      setSchema(tabId, schema);
      addToast({ type: "success", message: `Table "${draft.newName || draft.originalName}" updated` });
      onClose();
    } catch (e) {
      addToast({ type: "error", message: extractError(e) });
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={handleApply} disabled={noChanges || busy}>
        {busy ? "Applying…" : "Apply"}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={`Edit Table — ${table.name}`} footer={footer} width={720}>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs shrink-0" style={{ color: "var(--fg-subtle)", width: 80 }}>Table name</span>
        <ColInput
          type="text"
          value={draft.newName}
          onChange={(e) => setTableName(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>


      <div
        className="grid gap-1 mb-1 px-1"
        style={{
          gridTemplateColumns: "1fr 90px 32px 32px 32px 80px 28px",
          fontSize: 10,
          color: "var(--fg-subtle)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span>Name</span>
        <span>Type</span>
        <span style={{ textAlign: "center" }}>NN</span>
        <span style={{ textAlign: "center" }}>PK</span>
        <span style={{ textAlign: "center" }}>UQ</span>
        <span>Default</span>
        <span />
      </div>


      <datalist id="col-types">
        <option value="INTEGER" />
        <option value="TEXT" />
        <option value="REAL" />
        <option value="BLOB" />
        <option value="NUMERIC" />
        <option value="BOOLEAN" />
        <option value="DATE" />
        <option value="DATETIME" />
      </datalist>


      <div className="flex flex-col gap-1 mb-3">
        {draft.columns.map((col, idx) => {
          const isPk = col.pk > 0;
          const stableKey = col.originalName ?? `new-${idx}`;
          return (
            <div
              key={stableKey}
              className="grid gap-1 items-center px-1 py-0.5 rounded"
              style={{
                gridTemplateColumns: "1fr 90px 32px 32px 32px 80px 28px",
                background: "var(--bg-2)",
              }}
            >

              <ColInput
                type="text"
                value={col.name}
                placeholder="column_name"
                onChange={(e) => updateCol(idx, { name: e.target.value })}
                style={{ width: "100%" }}
              />


              <ColInput
                type="text"
                list="col-types"
                value={col.type}
                onChange={(e) => updateCol(idx, { type: e.target.value })}
                style={{ width: "100%" }}
              />


              <div style={{ display: "flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={col.notNull}
                  onChange={(e) => updateCol(idx, { notNull: e.target.checked })}
                  style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>


              <div style={{ display: "flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={isPk}
                  onChange={(e) => updateCol(idx, { pk: e.target.checked ? 1 : 0 })}
                  style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>


              <div style={{ display: "flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={col.unique}
                  disabled={isPk}
                  onChange={(e) => updateCol(idx, { unique: e.target.checked })}
                  style={{ cursor: isPk ? "not-allowed" : "pointer", accentColor: "var(--accent)" }}
                />
              </div>


              <ColInput
                type="text"
                value={col.defaultExpr ?? ""}
                placeholder="NULL"
                onChange={(e) => updateCol(idx, { defaultExpr: e.target.value || null })}
                style={{ width: "100%" }}
              />


              <button
                onClick={() => removeColumn(idx)}
                disabled={draft.columns.length <= 1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  cursor: draft.columns.length <= 1 ? "not-allowed" : "pointer",
                  color: draft.columns.length <= 1 ? "var(--fg-subtle)" : "var(--danger, #f87171)",
                  padding: 2,
                  borderRadius: "var(--r-sm)",
                  opacity: draft.columns.length <= 1 ? 0.3 : 1,
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>


      <Button variant="ghost" size="sm" onClick={addColumn} style={{ marginBottom: "12px" }}>
        + Add column
      </Button>


      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div className="text-xs mb-1" style={{ color: "var(--fg-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          SQL Preview
        </div>
        <pre
          style={{
            background: "var(--bg-0)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            padding: "8px 10px",
            fontSize: 11,
            fontFamily: "monospace",
            color: noChanges ? "var(--fg-subtle)" : "var(--fg-0)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            margin: 0,
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          {sql}
        </pre>
      </div>
    </Modal>
  );
}

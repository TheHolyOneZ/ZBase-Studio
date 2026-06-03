import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import type { DraftColumn, DraftTable } from "../../types/builder";
import { Toggle, TextInput, FieldLabel } from "../common/FormControls";
import ColumnRow from "./ColumnRow";
import Button from "../common/Button";

interface Props {
  table: DraftTable;
  allTables: DraftTable[];
  onChange: (patch: Partial<DraftTable>) => void;
}

function makeCol(): DraftColumn {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "TEXT",
    primaryKey: false,
    autoincrement: false,
    notNull: false,
    unique: false,
    defaultExpr: null,
    check: null,
    collate: null,
    fk: null,
  };
}

export default function TableEditor({ table, allTables, onChange }: Props) {

  const dragIdxRef = useRef<number | null>(null);
  const gripDragRef = useRef(false);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function updateCol(idx: number, patch: Partial<DraftColumn>) {
    const columns = table.columns.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ columns });
  }

  function removeCol(idx: number) {
    onChange({ columns: table.columns.filter((_, i) => i !== idx) });
  }

  function addCol() {
    onChange({ columns: [...table.columns, makeCol()] });
  }

  function handleDragStart(e: React.DragEvent, i: number) {
    const allowed = gripDragRef.current;
    gripDragRef.current = false;
    if (!allowed) { e.preventDefault(); return; }
    dragIdxRef.current = i;
    setDragIdx(i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(i);
  }

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    const from = dragIdxRef.current;
    resetDrag();
    if (from === null || from === i) return;
    const cols = [...table.columns];
    const [moved] = cols.splice(from, 1);
    cols.splice(i, 0, moved);
    onChange({ columns: cols });
  }

  function resetDrag() { dragIdxRef.current = null; setDragIdx(null); setDragOverIdx(null); }

  const pkColNames = table.columns.filter((c) => c.primaryKey).map((c) => c.name);
  const usingCompositePk = table.compositePk !== null;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <FieldLabel>Table name</FieldLabel>
          <TextInput
            value={table.name}
            onChange={(v) => onChange({ name: v })}
            placeholder="table_name"
            monospace
          />
        </div>
        <div className="flex gap-3 pt-4">
          <Toggle label="WITHOUT ROWID" checked={table.withoutRowid} onChange={(v) => onChange({ withoutRowid: v })} />
          <Toggle label="STRICT" checked={table.strict} onChange={(v) => onChange({ strict: v })} />
        </div>
      </div>


      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <FieldLabel>Columns</FieldLabel>
          <button
            onClick={addCol}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default transition-all"
            style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}
          >
            <Plus size={10} /> Add column
          </button>
        </div>
        {table.columns.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>No columns yet.</p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onChange({
                columns: [{
                  id: crypto.randomUUID(),
                  name: "id",
                  type: "INTEGER",
                  primaryKey: true,
                  autoincrement: true,
                  notNull: false,
                  unique: false,
                  defaultExpr: null,
                  check: null,
                  collate: null,
                  fk: null,
                }],
              })}
            >
              + Add id INTEGER PRIMARY KEY
            </Button>
          </div>
        )}
        {table.columns.map((col, i) => (
          <div
            key={col.id}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={resetDrag}
            style={{
              opacity: dragIdx === i ? 0.45 : 1,
              outline: dragOverIdx === i && dragIdx !== i ? "2px solid var(--accent)" : "none",
              borderRadius: 6,
              transition: "opacity 0.1s",
            }}
          >
            <ColumnRow
              column={col}
              allTables={allTables}
              onChange={(patch) => updateCol(i, patch)}
              onRemove={() => removeCol(i)}
              onGripMouseDown={() => { gripDragRef.current = true; }}
            />
          </div>
        ))}
      </div>


      {table.columns.length > 0 && (
        <div className="flex flex-col gap-2">
          <div>
            <FieldLabel>Primary Key — spans multiple columns?</FieldLabel>
            {pkColNames.length > 0 && (
              <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                Uncheck PK on all columns above to enable a multi-column primary key instead.
              </p>
            )}
          </div>
          {pkColNames.length === 0 && (
            <div className="flex flex-wrap gap-2">
              <Toggle
                label="This table's PK spans multiple columns"
                checked={usingCompositePk}
                onChange={(v) => onChange({ compositePk: v ? [] : null })}
              />
              {usingCompositePk && (
                <>
                  <p className="w-full text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                    Check the columns that together form the primary key:
                  </p>
                  {table.columns.map((c) => (
                    <Toggle
                      key={c.id}
                      label={c.name || "(unnamed)"}
                      checked={(table.compositePk ?? []).includes(c.name)}
                      onChange={(checked) => {
                        const prev = table.compositePk ?? [];
                        onChange({
                          compositePk: checked
                            ? [...prev, c.name]
                            : prev.filter((n) => n !== c.name),
                        });
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}


      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <FieldLabel>Table CHECK constraints</FieldLabel>
          <button
            onClick={() => onChange({ tableChecks: [...table.tableChecks, ""] })}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
          >
            <Plus size={10} /> Add
          </button>
        </div>
        {table.tableChecks.map((chk, i) => (
          <div key={i} className="flex gap-2">
            <TextInput
              value={chk}
              onChange={(v) => onChange({ tableChecks: table.tableChecks.map((c, j) => (j === i ? v : c)) })}
              placeholder="e.g. end_date >= start_date"
              monospace
            />
            <button
              onClick={() => onChange({ tableChecks: table.tableChecks.filter((_, j) => j !== i) })}
              className="text-xs px-2 rounded cursor-default"
              style={{ color: "var(--danger)", border: "1px solid var(--border)" }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

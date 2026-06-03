import { useState } from "react";
import type { PgDraftTable, PgDraftColumn } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";
import PgColumnRow from "./PgColumnRow";
import PgConstraintsPanel from "./PgConstraintsPanel";

interface Props {
  table: PgDraftTable;
  allTables: PgDraftTable[];
  availableSchemas: string[];
  onChange: (patch: Partial<PgDraftTable>) => void;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  borderRadius: 4,
  padding: "2px 8px",
  fontSize: 12,
  outline: "none",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--fg-subtle)",
  marginBottom: 6,
};

export default function PgTableEditor({ table, allTables, availableSchemas, onChange }: Props) {
  const [tab, setTab] = useState<"columns" | "constraints" | "options">("columns");

  function addColumn() {
    const col: PgDraftColumn = {
      id: crypto.randomUUID(),
      name: "",
      type: { base: "text" },
      notNull: false,
      identity: null,
      defaultExpr: null,
      check: null,
      collation: null,
      comment: null,
      fk: null,
    };
    onChange({ columns: [...table.columns, col] });
  }

  function patchColumn(id: string, patch: Partial<PgDraftColumn>) {
    onChange({ columns: table.columns.map((c) => c.id === id ? { ...c, ...patch } : c) });
  }

  function removeColumn(id: string) {
    const col = table.columns.find((c) => c.id === id);
    const newCols = table.columns.filter((c) => c.id !== id);

    if (col && table.primaryKey?.columns.includes(col.name)) {
      const pkCols = table.primaryKey.columns.filter((n) => n !== col.name);
      onChange({ columns: newCols, primaryKey: pkCols.length ? { ...table.primaryKey, columns: pkCols } : null });
    } else {
      onChange({ columns: newCols });
    }
  }

  function togglePk(colName: string) {
    const current = table.primaryKey?.columns ?? [];
    const next = current.includes(colName)
      ? current.filter((n) => n !== colName)
      : [...current, colName];
    onChange({ primaryKey: next.length ? { columns: next, name: table.primaryKey?.name ?? null } : null });
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    fontSize: 11,
    cursor: "default",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--fg-0)" : "var(--fg-subtle)",
  });

  return (
    <div className="flex flex-col h-full">

      <div className="px-4 pt-3 pb-2 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Schema</span>
            <SelectInput<string>
              value={table.schema}
              onChange={(v) => onChange({ schema: v })}
              options={availableSchemas.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div className="flex flex-col gap-0.5 flex-1">
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Table name</span>
            <input
              style={{ ...inputStyle, width: "100%" }}
              value={table.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="table_name"
            />
          </div>
        </div>

        <div className="flex items-center gap-0" style={{ borderBottom: "1px solid var(--border)", marginBottom: -1 }}>
          <button style={tabStyle(tab === "columns")} onClick={() => setTab("columns")}>Columns</button>
          <button style={tabStyle(tab === "constraints")} onClick={() => setTab("constraints")}>Constraints</button>
          <button style={tabStyle(tab === "options")} onClick={() => setTab("options")}>Options</button>
        </div>
      </div>


      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "columns" && (
          <div>
            <div style={sectionLabel}>Columns ({table.columns.length})</div>
            {table.columns.map((col) => (
              <PgColumnRow
                key={col.id}
                col={col}
                allTables={allTables}
                isPk={table.primaryKey?.columns.includes(col.name) ?? false}
                onTogglePk={() => togglePk(col.name)}
                onChange={(patch) => patchColumn(col.id, patch)}
                onRemove={() => removeColumn(col.id)}
              />
            ))}
            {table.columns.length === 0 && (
              <p className="text-xs mb-2" style={{ color: "var(--fg-subtle)" }}>No columns yet.</p>
            )}
            <button
              onClick={addColumn}
              style={{ fontSize: 11, color: "var(--accent)", cursor: "default", marginTop: 4 }}
            >+ Add column</button>
          </div>
        )}

        {tab === "constraints" && (
          <PgConstraintsPanel table={table} onChange={onChange} />
        )}

        {tab === "options" && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
              <Checkbox checked={table.unlogged} onChange={(v) => onChange({ unlogged: v })} />
              UNLOGGED TABLE (faster writes, not crash-safe)
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
              <Checkbox checked={table.temporary} onChange={(v) => onChange({ temporary: v })} />
              TEMPORARY TABLE (session-scoped)
            </label>
            <div className="flex flex-col gap-0.5">
              <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>COMMENT</span>
              <input
                style={{ ...inputStyle, width: "100%" }}
                value={table.comment ?? ""}
                placeholder="Optional table comment"
                onChange={(e) => onChange({ comment: e.target.value || null })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

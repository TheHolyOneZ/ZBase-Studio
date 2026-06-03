import { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { MysqlDraftTable, MysqlDraftColumn, MysqlEngine } from "../../../types/mysqlBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";
import MysqlColumnRow from "./MysqlColumnRow";
import MysqlConstraintsPanel from "./MysqlConstraintsPanel";

interface Props {
  table: MysqlDraftTable;
  allTables: MysqlDraftTable[];
  flavor: "mysql" | "mariadb";
  onChange: (patch: Partial<MysqlDraftTable>) => void;
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
  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.05em", color: "var(--fg-subtle)", marginBottom: 6,
};

const ENGINES_MYSQL: MysqlEngine[] = ["InnoDB", "MyISAM", "MEMORY", "ARCHIVE", "CSV"];
const ENGINES_MARIADB: MysqlEngine[] = ["InnoDB", "MyISAM", "Aria", "MEMORY", "ARCHIVE", "CSV"];

const CHARSETS = ["utf8mb4", "utf8", "latin1", "ascii", "binary", "utf16", "utf32"];
const ROW_FORMATS = ["", "DEFAULT", "DYNAMIC", "FIXED", "COMPRESSED", "REDUNDANT", "COMPACT"];

export default function MysqlTableEditor({ table, allTables, flavor, onChange }: Props) {
  const [tab, setTab] = useState<"columns" | "constraints" | "indexes" | "options">("columns");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", fontSize: 11, cursor: "default",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--fg-0)" : "var(--fg-subtle)",
  });

  function addColumn() {
    const col: MysqlDraftColumn = {
      id: crypto.randomUUID(),
      name: "",
      dataType: "VARCHAR",
      length: 255,
      precision: null,
      scale: null,
      fsp: null,
      unsigned: false,
      zerofill: false,
      notNull: false,
      autoIncrement: false,
      defaultExpr: null,
      onUpdateCurrentTimestamp: false,
      enumValues: [],
      setValues: [],
      invisible: false,
      generatedExpr: null,
      generatedStored: false,
      comment: "",
      collation: null,
      check: null,
      fk: null,
    };
    onChange({ columns: [...table.columns, col] });
  }

  function patchColumn(id: string, patch: Partial<MysqlDraftColumn>) {
    onChange({ columns: table.columns.map((c) => c.id === id ? { ...c, ...patch } : c) });
  }

  function removeColumn(id: string) {
    onChange({ columns: table.columns.filter((c) => c.id !== id) });
  }

  function moveColumn(idx: number, dir: -1 | 1) {
    const next = [...table.columns];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ columns: next });
  }

  const engines = flavor === "mariadb" ? ENGINES_MARIADB : ENGINES_MYSQL;

  return (
    <div className="flex flex-col h-full">

      <div className="px-4 pt-3 pb-2 flex flex-col gap-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5 flex-1">
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Table name</span>
            <input style={{ ...inputStyle, width: "100%" }} value={table.name}
              onChange={(e) => onChange({ name: e.target.value })} placeholder="table_name" />
          </div>
          <div className="flex flex-col gap-0.5" style={{ minWidth: 80 }}>
            <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Database</span>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-2)", color: "var(--fg-subtle)", border: "1px solid var(--border)" }}>
              {table.schema || "—"}
            </span>
          </div>
        </div>

        {table.systemVersioned && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px]"
            style={{ background: "rgba(180,120,0,0.08)", border: "1px solid rgba(180,120,0,0.25)", color: "#B47800" }}>
            <AlertCircle size={12} style={{ flexShrink: 0 }} />
            System-versioned temporal table — read-only in v1, edit via SQL.
          </div>
        )}

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
            {table.columns.map((col, i) => (
              <MysqlColumnRow
                key={col.id}
                col={col}
                allTables={allTables}
                flavor={flavor}
                onChange={(p) => patchColumn(col.id, p)}
                onRemove={() => removeColumn(col.id)}
                canMoveUp={i > 0}
                canMoveDown={i < table.columns.length - 1}
                onMoveUp={() => moveColumn(i, -1)}
                onMoveDown={() => moveColumn(i, 1)}
              />
            ))}
            {table.columns.length === 0 && (
              <p className="text-xs mb-2" style={{ color: "var(--fg-subtle)" }}>No columns yet.</p>
            )}
            <button onClick={addColumn}
              style={{ fontSize: 11, color: "var(--accent)", cursor: "default", marginTop: 4 }}>
              + Add column
            </button>
          </div>
        )}

        {tab === "constraints" && (
          <MysqlConstraintsPanel table={table} onChange={onChange} />
        )}

        {tab === "options" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>ENGINE</span>
                <SelectInput<MysqlEngine>
                  value={table.engine}
                  onChange={(v) => onChange({ engine: v })}
                  options={engines.map((e) => ({ value: e, label: e }))}
                  style={{ width: "100%" }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>DEFAULT CHARSET</span>
                <SelectInput<string>
                  value={table.charset}
                  onChange={(v) => onChange({ charset: v })}
                  options={CHARSETS.map((c) => ({ value: c, label: c }))}
                  style={{ width: "100%" }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>COLLATE</span>
                <input style={{ ...inputStyle, width: "100%" }} value={table.collate}
                  placeholder="utf8mb4_0900_ai_ci"
                  onChange={(e) => onChange({ collate: e.target.value })} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>ROW_FORMAT</span>
                <SelectInput<string>
                  value={table.rowFormat ?? ""}
                  onChange={(v) => onChange({ rowFormat: v || null })}
                  options={ROW_FORMATS.map((r) => ({ value: r, label: r || "DEFAULT" }))}
                  style={{ width: "100%" }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>AUTO_INCREMENT start</span>
                <input type="number" min={1} style={{ ...inputStyle, width: "100%" }}
                  value={table.autoIncrementStart ?? ""}
                  placeholder="default"
                  onChange={(e) => onChange({ autoIncrementStart: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>COMMENT</span>
              <input style={{ ...inputStyle, width: "100%" }} value={table.comment}
                placeholder="Optional table comment"
                onChange={(e) => onChange({ comment: e.target.value })} />
            </div>
            {flavor === "mariadb" && (
              <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
                <Checkbox checked={table.systemVersioned} onChange={(v) => onChange({ systemVersioned: v })} />
                WITH SYSTEM VERSIONING (temporal table)
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

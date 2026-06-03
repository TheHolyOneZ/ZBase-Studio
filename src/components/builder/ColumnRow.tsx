import { useState } from "react";
import { Trash2, ChevronDown, ChevronRight, Link, GripVertical } from "lucide-react";
import type { DraftColumn, DraftTable, FkAction } from "../../types/builder";
import { TextInput, SelectInput } from "../common/FormControls";

const COMMON_TYPES = ["INTEGER", "TEXT", "REAL", "BLOB", "NUMERIC", "BOOLEAN", "DATE", "DATETIME"];
const FK_ACTIONS: FkAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];
const COLLATIONS = ["BINARY", "NOCASE", "RTRIM"] as const;

interface Props {
  column: DraftColumn;
  allTables: DraftTable[];
  onChange: (patch: Partial<DraftColumn>) => void;
  onRemove: () => void;
  onGripMouseDown?: () => void;
}

export default function ColumnRow({ column: col, allTables, onChange, onRemove, onGripMouseDown }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showFkPicker, setShowFkPicker] = useState(false);

  const fkTarget = col.fk ? allTables.find((t) => t.name === col.fk!.table) : null;

  function chip(label: string, active: boolean, onClick: () => void, disabled = false) {
    return (
      <button
        key={label}
        onClick={onClick}
        disabled={disabled}
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-default transition-all select-none"
        style={{
          background: active ? "var(--accent)" : "var(--bg-0)",
          color: active ? "#0B0F14" : "var(--fg-subtle)",
          border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="rounded flex flex-col gap-0"
      style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}
    >

      <div className="flex items-center gap-2 px-2 py-1.5">

        <span
          onMouseDown={onGripMouseDown}
          className="shrink-0 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-80 transition-opacity"
          style={{ color: "var(--fg-muted)", touchAction: "none" }}
          title="Drag to reorder"
        >
          <GripVertical size={12} />
        </span>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 cursor-default"
          style={{ color: "var(--fg-subtle)" }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>


        <TextInput
          value={col.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="column_name"
          monospace
          className="flex-1 min-w-0"
        />


        <div className="relative">
          <input
            list={`types-${col.id}`}
            value={col.type}
            onChange={(e) => onChange({ type: e.target.value.toUpperCase() })}
            placeholder="TEXT"
            className="px-2 py-1 rounded text-xs outline-none w-24"
            style={{ background: "var(--bg-0)", border: "1px solid var(--border)", color: "var(--fg-0)" }}
          />
          <datalist id={`types-${col.id}`}>
            {COMMON_TYPES.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>


        <div className="flex gap-1 shrink-0">
          {chip("PK", col.primaryKey, () => onChange({ primaryKey: !col.primaryKey, autoincrement: false }))}
          {chip("AI", col.autoincrement, () => onChange({ autoincrement: !col.autoincrement }), !col.primaryKey || col.type.toUpperCase() !== "INTEGER")}
          {chip("NN", col.notNull, () => onChange({ notNull: !col.notNull }), col.primaryKey)}
          {chip("UQ", col.unique, () => onChange({ unique: !col.unique }), col.primaryKey)}
          <button
            onClick={() => setShowFkPicker((v) => !v)}
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-default transition-all select-none"
            style={{
              background: col.fk ? "rgba(34,211,238,0.2)" : "var(--bg-0)",
              color: col.fk ? "var(--accent)" : "var(--fg-subtle)",
              border: `1px solid ${col.fk ? "var(--accent)" : "var(--border)"}`,
            }}
            title={col.fk ? `FK → ${col.fk.table}.${col.fk.column}` : "Add FK"}
          >
            <Link size={9} />
          </button>
        </div>


        <button
          onClick={onRemove}
          className="shrink-0 cursor-default opacity-40 hover:opacity-100 transition-opacity"
          style={{ color: "var(--danger)" }}
        >
          <Trash2 size={12} />
        </button>
      </div>


      {showFkPicker && (
        <div className="flex flex-wrap gap-2 px-3 pb-2 pt-1 items-end" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex flex-col gap-1">
            <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>References table</span>
            <SelectInput<string>
              value={col.fk?.table ?? ""}
              onChange={(v) => onChange({ fk: v ? { table: v, column: "", onDelete: "NO ACTION", onUpdate: "NO ACTION" } : null })}
              options={[{ value: "", label: "— none —" }, ...allTables.map((t) => ({ value: t.name, label: t.name }))]}
              className="w-32"
            />
          </div>
          {col.fk?.table && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Column</span>
                <SelectInput<string>
                  value={col.fk.column}
                  onChange={(v) => onChange({ fk: { ...col.fk!, column: v } })}
                  options={(fkTarget?.columns ?? []).map((c) => ({ value: c.name, label: c.name }))}
                  className="w-28"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON DELETE</span>
                <SelectInput<FkAction>
                  value={col.fk.onDelete}
                  onChange={(v) => onChange({ fk: { ...col.fk!, onDelete: v } })}
                  options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON UPDATE</span>
                <SelectInput<FkAction>
                  value={col.fk.onUpdate}
                  onChange={(v) => onChange({ fk: { ...col.fk!, onUpdate: v } })}
                  options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                  className="w-32"
                />
              </div>
            </>
          )}
          {col.fk && (
            <button
              onClick={() => { onChange({ fk: null }); setShowFkPicker(false); }}
              className="text-[10px] cursor-default px-2 py-1 rounded"
              style={{ color: "var(--danger)", border: "1px solid var(--border)" }}
            >
              Remove FK
            </button>
          )}
        </div>
      )}


      {expanded && (
        <div className="flex flex-wrap gap-3 px-3 pb-2 pt-1 items-end" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex flex-col gap-1">
            <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>DEFAULT</span>
            <TextInput
              value={col.defaultExpr ?? ""}
              onChange={(v) => onChange({ defaultExpr: v || null })}
              placeholder="e.g. 0 or 'text'"
              monospace
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>CHECK</span>
            <TextInput
              value={col.check ?? ""}
              onChange={(v) => onChange({ check: v || null })}
              placeholder="e.g. length(val) > 0"
              monospace
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>COLLATE</span>
            <SelectInput
              value={col.collate ?? ""}
              onChange={(v) => onChange({ collate: (v || null) as typeof col.collate })}
              options={[{ value: "", label: "— default —" }, ...COLLATIONS.map((c) => ({ value: c, label: c }))]}
              className="w-28"
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import type { PgDraftColumn, PgDraftTable, PgFkAction, PgType } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";
import PgTypePicker from "./PgTypePicker";

interface Props {
  col: PgDraftColumn;
  allTables: PgDraftTable[];
  isPk: boolean;
  onTogglePk: () => void;
  onChange: (patch: Partial<PgDraftColumn>) => void;
  onRemove: () => void;
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "1px 6px",
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  cursor: "default",
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  background: active ? "var(--accent-soft)" : "transparent",
  color: active ? "var(--accent)" : "var(--fg-subtle)",
  userSelect: "none",
});

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
  outline: "none",
  width: "100%",
};

const FK_ACTIONS: PgFkAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];

export default function PgColumnRow({ col, allTables, isPk, onTogglePk, onChange, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isExisting = !!col.serverId;

  return (
    <div className="rounded mb-1" style={{ border: "1px solid var(--border)", background: "var(--bg-1)" }}>

      <div className="flex items-center gap-2 px-2 py-1.5">
        <input
          value={col.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="column_name"
          style={{ ...inputStyle, width: 140, flexShrink: 0 }}
        />
        <PgTypePicker value={col.type} onChange={(t: PgType) => onChange({ type: t })} />
        <div className="flex items-center gap-1 ml-1">
          <span
            style={chipStyle(isPk)}
            onClick={onTogglePk}
            title="Primary Key"
          >PK</span>
          <span
            style={chipStyle(col.notNull && !col.generated)}
            onClick={() => { if (!col.generated) onChange({ notNull: !col.notNull }); }}
            title={col.generated ? "Generated columns handle nullability via expression" : "NOT NULL"}
          >NN</span>
          <span
            style={chipStyle(!!col.identity && !col.generated)}
            onClick={() => { if (!col.generated) onChange({ identity: col.identity ? null : { generation: "BY DEFAULT" }, defaultExpr: null }); }}
            title={col.generated ? "Cannot combine IDENTITY with GENERATED" : "Identity"}
          >ID</span>
          <span
            style={chipStyle(!!(col.generated))}
            onClick={() => onChange(col.generated
              ? { generated: null }
              : { generated: { expression: "", stored: true }, identity: null, defaultExpr: null }
            )}
            title="GENERATED ALWAYS AS ... STORED"
          >GEN</span>
        </div>
        {col.identity && (
          <SelectInput<"BY DEFAULT" | "ALWAYS">
            value={col.identity.generation}
            onChange={(v) => onChange({ identity: { generation: v } })}
            options={[
              { value: "BY DEFAULT", label: "BY DEFAULT" },
              { value: "ALWAYS", label: "ALWAYS" },
            ]}
            style={{ width: 110 }}
          />
        )}
        <div className="flex items-center gap-1 ml-auto">
          {col.fk && <Link2 size={10} style={{ color: "var(--accent)" }} aria-label={`FK → ${col.fk.table}`} />}
          {col.collation && (
            <span title={`COLLATE ${col.collation}`}
              style={{ fontSize: 9, padding: "0 4px", borderRadius: 2,
                background: "var(--bg-2)", color: "var(--fg-subtle)" }}>
              Aa
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ color: "var(--fg-subtle)", padding: "1px 4px", cursor: "default" }}
            title="Advanced options"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={onRemove}
            style={{ color: "var(--danger)", fontSize: 14, cursor: "default", padding: "0 2px" }}
          >×</button>
        </div>
      </div>


      {expanded && (
        <div className="px-3 pb-2 pt-1 flex flex-col gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          {col.generated && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold" style={{ color: "var(--fg-subtle)" }}>GENERATED ALWAYS AS … STORED</span>
            <input
              style={inputStyle}
              value={col.generated.expression}
              placeholder="e.g. price * quantity"
              onChange={(e) => onChange({ generated: { expression: e.target.value, stored: true } })}
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>DEFAULT</span>
              <input
                style={inputStyle}
                value={col.defaultExpr ?? ""}
                disabled={!!col.identity || !!col.generated}
                placeholder={col.identity || col.generated ? "Disabled" : "e.g. CURRENT_TIMESTAMP"}
                onChange={(e) => onChange({ defaultExpr: e.target.value || null })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>CHECK</span>
              <input
                style={inputStyle}
                value={col.check ?? ""}
                placeholder="e.g. length(name) > 0"
                onChange={(e) => onChange({ check: e.target.value || null })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>COLLATION</span>
              <input
                style={inputStyle}
                value={col.collation ?? ""}
                placeholder='e.g. "C"'
                onChange={(e) => onChange({ collation: e.target.value || null })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>COMMENT</span>
              <input
                style={inputStyle}
                value={col.comment ?? ""}
                placeholder="Optional comment"
                onChange={(e) => onChange({ comment: e.target.value || null })}
              />
            </label>
          </div>


          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Foreign Key</span>
              <button
                style={{ fontSize: 11, color: col.fk ? "var(--danger)" : "var(--accent)", cursor: "default" }}
                onClick={() => onChange({ fk: col.fk ? null : { schema: "public", table: "", column: "", onDelete: "NO ACTION", onUpdate: "NO ACTION", deferrable: false, initiallyDeferred: false } })}
              >
                {col.fk ? "Remove FK" : "+ Add FK"}
              </button>
            </div>
            {col.fk && (
              <div className="grid grid-cols-3 gap-2">
                <SelectInput<string>
                  value={col.fk.table}
                  onChange={(v) => onChange({ fk: { ...col.fk!, table: v, column: "" } })}
                  options={[
                    { value: "", label: "— table —" },
                    ...allTables.map((t) => ({ value: t.name, label: t.schema !== "public" ? `${t.schema}.${t.name}` : t.name })),
                  ]}
                  style={{ width: "100%" }}
                />
                <SelectInput<string>
                  value={col.fk.column}
                  onChange={(v) => onChange({ fk: { ...col.fk!, column: v } })}
                  options={[
                    { value: "", label: "— column —" },
                    ...(allTables.find((t) => t.name === col.fk!.table)?.columns.map((c) => ({ value: c.name, label: c.name })) ?? []),
                  ]}
                  style={{ width: "100%" }}
                />
                <SelectInput<string>
                  value={col.fk.schema}
                  onChange={(v) => onChange({ fk: { ...col.fk!, schema: v } })}
                  options={allTables
                    .filter((t) => t.name === col.fk!.table)
                    .map((t) => ({ value: t.schema, label: t.schema }))}
                  style={{ width: "100%" }}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON DELETE</span>
                  <SelectInput<PgFkAction>
                    value={col.fk.onDelete}
                    onChange={(v) => onChange({ fk: { ...col.fk!, onDelete: v } })}
                    options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON UPDATE</span>
                  <SelectInput<PgFkAction>
                    value={col.fk.onUpdate}
                    onChange={(v) => onChange({ fk: { ...col.fk!, onUpdate: v } })}
                    options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
                    <Checkbox checked={col.fk.deferrable} onChange={(v) => onChange({ fk: { ...col.fk!, deferrable: v, initiallyDeferred: v ? col.fk!.initiallyDeferred : false } })} />
                    Deferrable
                  </label>
                  {col.fk.deferrable && (
                    <label className="flex items-center gap-1.5 text-[11px] cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
                      <Checkbox checked={!!col.fk.initiallyDeferred} onChange={(v) => onChange({ fk: { ...col.fk!, initiallyDeferred: v } })} />
                      Initially Deferred
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {isExisting && (
            <p className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
              Existing column — drag-reorder not supported by PostgreSQL.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

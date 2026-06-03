import { useState } from "react";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import type { MysqlDraftColumn, MysqlDraftTable, MysqlFkAction } from "../../../types/mysqlBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";
import MysqlTypePicker from "./MysqlTypePicker";

interface Props {
  col: MysqlDraftColumn;
  allTables: MysqlDraftTable[];
  flavor: "mysql" | "mariadb";
  onChange: (patch: Partial<MysqlDraftColumn>) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
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

const FK_ACTIONS: MysqlFkAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];

const isTimestampLike = (dt: string) => ["DATETIME", "TIMESTAMP"].includes(dt.toUpperCase());

export default function MysqlColumnRow({ col, allTables, flavor, onChange, onRemove, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded mb-1" style={{ border: "1px solid var(--border)", background: "var(--bg-1)" }}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <input
          value={col.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="column_name"
          style={{ ...inputStyle, width: 130, flexShrink: 0 }}
        />

        <MysqlTypePicker col={col} flavor={flavor} onChange={onChange} />

        <div className="flex items-center gap-1 ml-1">
          <span style={chipStyle(col.notNull)} onClick={() => onChange({ notNull: !col.notNull })} title="NOT NULL">NN</span>
          <span style={chipStyle(col.autoIncrement)} onClick={() => onChange({ autoIncrement: !col.autoIncrement })} title="AUTO_INCREMENT">AI</span>
          <span style={chipStyle(col.unsigned)} onClick={() => onChange({ unsigned: !col.unsigned })} title="UNSIGNED">UN</span>
          {flavor === "mariadb" && (
            <span style={chipStyle(col.invisible)} onClick={() => onChange({ invisible: !col.invisible })} title="INVISIBLE">INV</span>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {col.fk && <Link2 size={10} style={{ color: "var(--accent)" }} aria-label={`FK → ${col.fk.refTable}`} />}
          {col.collation && (
            <span title={`COLLATE ${col.collation}`}
              style={{ fontSize: 9, padding: "0 4px", borderRadius: 2,
                background: "var(--bg-2)", color: "var(--fg-subtle)" }}>
              Aa
            </span>
          )}
          <button onClick={onMoveUp} disabled={!canMoveUp}
            title="Move column up"
            style={{ color: canMoveUp ? "var(--fg-subtle)" : "var(--border)", padding: "1px 2px", cursor: canMoveUp ? "default" : "not-allowed" }}>
            <ChevronUp size={11} />
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown}
            title="Move column down"
            style={{ color: canMoveDown ? "var(--fg-subtle)" : "var(--border)", padding: "1px 2px", cursor: canMoveDown ? "default" : "not-allowed" }}>
            <ChevronDown size={11} />
          </button>
          <button onClick={() => setExpanded((v) => !v)}
            style={{ color: "var(--fg-subtle)", padding: "1px 4px", cursor: "default" }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button onClick={onRemove}
            style={{ color: "var(--danger)", fontSize: 14, cursor: "default", padding: "0 2px" }}>×</button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pt-1 flex flex-col gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>DEFAULT</span>
              <input style={inputStyle} value={col.defaultExpr ?? ""}
                disabled={!!col.generatedExpr || col.autoIncrement}
                placeholder={col.generatedExpr || col.autoIncrement ? "Disabled" : "e.g. CURRENT_TIMESTAMP"}
                onChange={(e) => onChange({ defaultExpr: e.target.value || null })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>COMMENT</span>
              <input style={inputStyle} value={col.comment ?? ""}
                placeholder="Optional comment"
                onChange={(e) => onChange({ comment: e.target.value })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>COLLATION</span>
              <input style={inputStyle} value={col.collation ?? ""}
                placeholder="e.g. utf8mb4_unicode_ci"
                onChange={(e) => onChange({ collation: e.target.value || null })} />
            </label>
          </div>

          {isTimestampLike(col.dataType) && (
            <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
              <Checkbox checked={col.onUpdateCurrentTimestamp} onChange={(v) => onChange({ onUpdateCurrentTimestamp: v })} />
              ON UPDATE CURRENT_TIMESTAMP
            </label>
          )}

          <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
            <Checkbox checked={col.zerofill} onChange={(v) => onChange({ zerofill: v })} />
            ZEROFILL
          </label>


          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Generated expression</span>
              <button style={{ fontSize: 11, color: col.generatedExpr ? "var(--danger)" : "var(--accent)", cursor: "default" }}
                onClick={() => onChange(col.generatedExpr ? { generatedExpr: null } : { generatedExpr: "", autoIncrement: false, defaultExpr: null })}>
                {col.generatedExpr ? "Remove" : "+ Add"}
              </button>
            </div>
            {col.generatedExpr !== null && (
              <div className="flex items-center gap-2">
                <input style={{ ...inputStyle, flex: 1 }} value={col.generatedExpr}
                  placeholder="e.g. price * quantity"
                  onChange={(e) => onChange({ generatedExpr: e.target.value })} />
                <div className="flex gap-2">
                  {(["VIRTUAL", "STORED"] as const).map((s) => (
                    <label key={s} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--fg-muted)" }}>
                      <input type="radio" checked={s === "STORED" ? col.generatedStored : !col.generatedStored}
                        onChange={() => onChange({ generatedStored: s === "STORED" })} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>


          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>CHECK constraint</span>
              <button style={{ fontSize: 11, color: col.check !== null ? "var(--danger)" : "var(--accent)", cursor: "default" }}
                onClick={() => onChange(col.check !== null ? { check: null } : { check: "" })}>
                {col.check !== null ? "Remove" : "+ Add"}
              </button>
            </div>
            {col.check !== null && (
              <input style={inputStyle} value={col.check}
                placeholder="e.g. age >= 0"
                onChange={(e) => onChange({ check: e.target.value })} />
            )}
          </div>


          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Column-level FK</span>
              <button style={{ fontSize: 11, color: col.fk ? "var(--danger)" : "var(--accent)", cursor: "default" }}
                onClick={() => onChange({ fk: col.fk ? null : { refTable: "", refColumn: "", onDelete: "NO ACTION", onUpdate: "NO ACTION" } })}>
                {col.fk ? "Remove FK" : "+ Add FK"}
              </button>
            </div>
            {col.fk && (
              <div className="grid grid-cols-2 gap-2">
                <SelectInput<string>
                  value={col.fk.refTable}
                  onChange={(v) => onChange({ fk: { ...col.fk!, refTable: v, refColumn: "" } })}
                  options={[{ value: "", label: "— table —" }, ...allTables.map((t) => ({ value: t.name, label: t.name }))]}
                  style={{ width: "100%" }}
                />
                <SelectInput<string>
                  value={col.fk.refColumn}
                  onChange={(v) => onChange({ fk: { ...col.fk!, refColumn: v } })}
                  options={[
                    { value: "", label: "— column —" },
                    ...(allTables.find((t) => t.name === col.fk!.refTable)?.columns.map((c) => ({ value: c.name, label: c.name })) ?? []),
                  ]}
                  style={{ width: "100%" }}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON DELETE</span>
                  <SelectInput<MysqlFkAction>
                    value={col.fk.onDelete}
                    onChange={(v) => onChange({ fk: { ...col.fk!, onDelete: v } })}
                    options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON UPDATE</span>
                  <SelectInput<MysqlFkAction>
                    value={col.fk.onUpdate}
                    onChange={(v) => onChange({ fk: { ...col.fk!, onUpdate: v } })}
                    options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

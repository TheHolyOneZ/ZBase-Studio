import type { MysqlDraftTable, MysqlDraftConstraint, MysqlFkAction } from "../../../types/mysqlBuilder";
import { SelectInput } from "../../common/FormControls";

interface Props {
  table: MysqlDraftTable;
  onChange: (patch: Partial<MysqlDraftTable>) => void;
}

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

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.05em", color: "var(--fg-subtle)",
};

function addConstraint(table: MysqlDraftTable, kind: MysqlDraftConstraint["kind"]): MysqlDraftTable {
  const c: MysqlDraftConstraint = {
    id: crypto.randomUUID(),
    kind,
    name: "",
    columns: [],
    checkExpr: "",
    fkColumns: [],
    fkRefTable: "",
    fkRefColumns: [],
    fkOnDelete: "NO ACTION",
    fkOnUpdate: "NO ACTION",
  };
  return { ...table, constraints: [...table.constraints, c] };
}

export default function MysqlConstraintsPanel({ table, onChange }: Props) {
  function patch(id: string, p: Partial<MysqlDraftConstraint>) {
    onChange({ constraints: table.constraints.map((c) => c.id === id ? { ...c, ...p } : c) });
  }
  function remove(id: string) {
    onChange({ constraints: table.constraints.filter((c) => c.id !== id) });
  }

  const uniques = table.constraints.filter((c) => c.kind === "UNIQUE");
  const checks = table.constraints.filter((c) => c.kind === "CHECK");
  const fks = table.constraints.filter((c) => c.kind === "FOREIGN");

  return (
    <div className="flex flex-col gap-4">

      <div>
        <div className="flex items-center justify-between mb-1">
          <span style={sectionLabel}>PRIMARY KEY</span>
        </div>
        <input
          style={inputStyle}
          value={(table.primaryKey?.columns ?? []).join(", ")}
          placeholder="col1, col2, …"
          onChange={(e) => {
            const cols = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            onChange({ primaryKey: cols.length ? { columns: cols } : null });
          }}
        />
        <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>Comma-separated column names</p>
      </div>


      <div>
        <div className="flex items-center justify-between mb-1">
          <span style={sectionLabel}>UNIQUE</span>
          <button style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }}
            onClick={() => onChange(addConstraint(table, "UNIQUE"))}>+ Add UNIQUE</button>
        </div>
        {uniques.map((u) => (
          <div key={u.id} className="flex items-center gap-2 mb-1">
            <input style={{ ...inputStyle, width: 120 }} value={u.name}
              placeholder="constraint name"
              onChange={(e) => patch(u.id, { name: e.target.value })} />
            <input style={inputStyle} value={u.columns.join(", ")}
              placeholder="col1, col2, …"
              onChange={(e) => patch(u.id, { columns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            <button onClick={() => remove(u.id)} style={{ color: "var(--danger)", cursor: "default", flexShrink: 0 }}>×</button>
          </div>
        ))}
        {uniques.length === 0 && <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No UNIQUE constraints</p>}
      </div>


      <div>
        <div className="flex items-center justify-between mb-1">
          <span style={sectionLabel}>CHECK</span>
          <button style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }}
            onClick={() => onChange(addConstraint(table, "CHECK"))}>+ Add CHECK</button>
        </div>
        {checks.map((ch) => (
          <div key={ch.id} className="flex items-center gap-2 mb-1">
            <input style={{ ...inputStyle, width: 140 }} value={ch.name}
              placeholder="constraint name"
              onChange={(e) => patch(ch.id, { name: e.target.value })} />
            <input style={inputStyle} value={ch.checkExpr}
              placeholder="e.g. age > 0"
              onChange={(e) => patch(ch.id, { checkExpr: e.target.value })} />
            <button onClick={() => remove(ch.id)} style={{ color: "var(--danger)", cursor: "default", flexShrink: 0 }}>×</button>
          </div>
        ))}
        {checks.length === 0 && <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No CHECK constraints</p>}
      </div>


      <div>
        <div className="flex items-center justify-between mb-1">
          <span style={sectionLabel}>FOREIGN KEY</span>
          <button style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }}
            onClick={() => onChange(addConstraint(table, "FOREIGN"))}>+ Add FK</button>
        </div>
        {fks.map((fk) => (
          <div key={fk.id} className="rounded mb-2 p-2 flex flex-col gap-1.5" style={{ border: "1px solid var(--border)", background: "var(--bg-1)" }}>
            <div className="flex items-center gap-2">
              <input style={{ ...inputStyle, width: 160 }} value={fk.name}
                placeholder="constraint name"
                onChange={(e) => patch(fk.id, { name: e.target.value })} />
              <button onClick={() => remove(fk.id)} style={{ color: "var(--danger)", cursor: "default", marginLeft: "auto", flexShrink: 0 }}>×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Local columns</span>
                <input style={inputStyle} value={fk.fkColumns.join(", ")}
                  placeholder="col1, col2"
                  onChange={(e) => patch(fk.id, { fkColumns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Ref table</span>
                <input style={inputStyle} value={fk.fkRefTable}
                  placeholder="referenced_table"
                  onChange={(e) => patch(fk.id, { fkRefTable: e.target.value })} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Ref columns</span>
                <input style={inputStyle} value={fk.fkRefColumns.join(", ")}
                  placeholder="col1, col2"
                  onChange={(e) => patch(fk.id, { fkRefColumns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON DELETE</span>
                  <SelectInput<MysqlFkAction> value={fk.fkOnDelete}
                    onChange={(v) => patch(fk.id, { fkOnDelete: v })}
                    options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                    style={{ width: "100%" }} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>ON UPDATE</span>
                  <SelectInput<MysqlFkAction> value={fk.fkOnUpdate}
                    onChange={(v) => patch(fk.id, { fkOnUpdate: v })}
                    options={FK_ACTIONS.map((a) => ({ value: a, label: a }))}
                    style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {fks.length === 0 && <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No foreign keys</p>}
      </div>
    </div>
  );
}

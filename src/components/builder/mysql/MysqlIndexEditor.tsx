import type { MysqlDraftIndex, MysqlDraftTable, MysqlIndexMethod, MysqlDraftIndexColumn } from "../../../types/mysqlBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

interface Props {
  index: MysqlDraftIndex;
  allTables: MysqlDraftTable[];
  flavor: "mysql" | "mariadb";
  onChange: (patch: Partial<MysqlDraftIndex>) => void;
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

const METHODS: MysqlIndexMethod[] = ["BTREE", "HASH", "FULLTEXT", "SPATIAL"];

export default function MysqlIndexEditor({ index, allTables, flavor, onChange }: Props) {
  const targetTable = allTables.find((t) => t.name === index.table);

  function addColumn() {
    const col: MysqlDraftIndexColumn = { columnName: "", expression: null, prefixLength: null, direction: "ASC" };
    onChange({ columns: [...index.columns, col] });
  }

  function patchCol(i: number, patch: Partial<MysqlDraftIndexColumn>) {
    onChange({ columns: index.columns.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  }

  function removeCol(i: number) {
    onChange({ columns: index.columns.filter((_, idx) => idx !== i) });
  }

  const isFulltextOrSpatial = index.method === "FULLTEXT" || index.method === "SPATIAL";

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Index name</span>
          <input style={inputStyle} value={index.name} placeholder="idx_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Method</span>
          <SelectInput<MysqlIndexMethod>
            value={index.method}
            onChange={(v) => onChange({ method: v, unique: v === "FULLTEXT" || v === "SPATIAL" ? false : index.unique })}
            options={METHODS.map((m) => ({ value: m, label: m }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5 col-span-2">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Table</span>
          <SelectInput<string>
            value={index.table}
            onChange={(v) => onChange({ table: v })}
            options={[{ value: "", label: "— select table —" }, ...allTables.map((t) => ({ value: t.name, label: t.name }))]}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {!isFulltextOrSpatial && (
        <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
          <Checkbox checked={index.unique} onChange={(v) => onChange({ unique: v })} />
          UNIQUE index
        </label>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Columns</span>
          <button style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }} onClick={addColumn}>+ Add</button>
        </div>
        {index.columns.map((col, i) => {
          const isExpr = col.expression !== null;
          const exprDisabled = flavor === "mariadb";
          return (
            <div key={i} className="flex items-center gap-2 mb-1">
              <button
                title={exprDisabled ? "Expression indexes require MySQL 8.0+" : isExpr ? "Switch to column" : "Switch to expression"}
                disabled={exprDisabled}
                onClick={() => patchCol(i, isExpr ? { expression: null, columnName: "" } : { expression: "", columnName: "" })}
                style={{
                  fontSize: 10, padding: "1px 5px", borderRadius: 3, cursor: exprDisabled ? "not-allowed" : "default",
                  border: `1px solid ${isExpr ? "var(--accent)" : "var(--border)"}`,
                  background: isExpr ? "var(--accent-soft)" : "transparent",
                  color: isExpr ? "var(--accent)" : "var(--fg-subtle)",
                  opacity: exprDisabled ? 0.4 : 1,
                  flexShrink: 0,
                }}
              >
                expr
              </button>
              {isExpr ? (
                <input style={{ ...inputStyle, flex: 1 }} value={col.expression ?? ""}
                  placeholder="e.g. LOWER(name)"
                  onChange={(e) => patchCol(i, { expression: e.target.value })} />
              ) : targetTable ? (
                <SelectInput<string>
                  value={col.columnName}
                  onChange={(v) => patchCol(i, { columnName: v })}
                  options={[{ value: "", label: "— column —" }, ...targetTable.columns.map((c) => ({ value: c.name, label: c.name }))]}
                  style={{ flex: 1 }}
                />
              ) : (
                <input style={{ ...inputStyle, flex: 1 }} value={col.columnName} placeholder="column_name"
                  onChange={(e) => patchCol(i, { columnName: e.target.value })} />
              )}
              <input type="number" min={1} disabled={isExpr}
                style={{ background: "var(--bg-0)", border: "1px solid var(--border)", color: "var(--fg-0)", borderRadius: 4, padding: "2px 4px", fontSize: 12, outline: "none", width: 60, opacity: isExpr ? 0.4 : 1 }}
                value={col.prefixLength ?? ""} placeholder="prefix"
                title={isExpr ? "Prefix length not supported for expression indexes" : "Prefix length (optional, for text columns)"}
                onChange={(e) => patchCol(i, { prefixLength: e.target.value ? Number(e.target.value) : null })} />
              <SelectInput<"ASC" | "DESC">
                value={col.direction}
                onChange={(v) => patchCol(i, { direction: v })}
                options={[{ value: "ASC", label: "ASC" }, { value: "DESC", label: "DESC" }]}
                style={{ width: 70, flexShrink: 0 }}
              />
              <button onClick={() => removeCol(i)} style={{ color: "var(--danger)", cursor: "default" }}>×</button>
            </div>
          );
        })}
        {index.columns.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No columns</p>
        )}
        {isFulltextOrSpatial && (
          <p className="text-[11px] mt-1" style={{ color: "var(--fg-subtle)" }}>
            {index.method === "FULLTEXT" ? "FULLTEXT indexes do not support prefix lengths or HASH method." : "SPATIAL indexes require geometry column types."}
          </p>
        )}
      </div>
    </div>
  );
}

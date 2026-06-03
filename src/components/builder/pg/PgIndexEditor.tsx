import type { PgDraftIndex, PgDraftTable, PgIndexMethod, PgDraftIndexColumn } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

interface Props {
  index: PgDraftIndex;
  allTables: PgDraftTable[];
  availableSchemas: string[];
  onChange: (patch: Partial<PgDraftIndex>) => void;
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

const METHODS: PgIndexMethod[] = ["btree", "hash", "gin", "gist", "brin", "spgist"];

export default function PgIndexEditor({ index, allTables, availableSchemas, onChange }: Props) {
  const targetTable = allTables.find((t) => t.name === index.table && t.schema === index.schema);

  function addColumn() {
    const col: PgDraftIndexColumn = { expr: "", direction: "ASC", nulls: "LAST" };
    onChange({ columns: [...index.columns, col] });
  }

  function patchCol(i: number, patch: Partial<PgDraftIndexColumn>) {
    const cols = index.columns.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    onChange({ columns: cols });
  }

  function removeCol(i: number) {
    onChange({ columns: index.columns.filter((_, idx) => idx !== i) });
  }

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
          <SelectInput<PgIndexMethod>
            value={index.method}
            onChange={(v) => onChange({ method: v })}
            options={METHODS.map((m) => ({ value: m, label: m.toUpperCase() }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Schema</span>
          <SelectInput<string>
            value={index.schema}
            onChange={(v) => onChange({ schema: v })}
            options={availableSchemas.map((s) => ({ value: s, label: s }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Table</span>
          <SelectInput<string>
            value={index.table}
            onChange={(v) => onChange({ table: v })}
            options={[
              { value: "", label: "— select table —" },
              ...allTables.map((t) => ({ value: t.name, label: t.schema !== "public" ? `${t.schema}.${t.name}` : t.name })),
            ]}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
        <Checkbox checked={index.unique} onChange={(v) => onChange({ unique: v })} />
        UNIQUE index
      </label>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Columns</span>
          <button style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }} onClick={addColumn}>+ Add</button>
        </div>
        {index.columns.map((col, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            {targetTable ? (
              <SelectInput<string>
                value={col.expr}
                onChange={(v) => patchCol(i, { expr: v })}
                options={[
                  { value: "", label: "— column —" },
                  ...targetTable.columns.map((c) => ({ value: c.name, label: c.name })),
                ]}
                style={{ flex: 1 }}
              />
            ) : (
              <input style={{ ...inputStyle, flex: 1 }} value={col.expr} placeholder="column or expression"
                onChange={(e) => patchCol(i, { expr: e.target.value })} />
            )}
            <SelectInput<"ASC" | "DESC">
              value={col.direction}
              onChange={(v) => patchCol(i, { direction: v })}
              options={[{ value: "ASC", label: "ASC" }, { value: "DESC", label: "DESC" }]}
              style={{ width: 64 }}
            />
            <SelectInput<"FIRST" | "LAST">
              value={col.nulls}
              onChange={(v) => patchCol(i, { nulls: v })}
              options={[{ value: "LAST", label: "NULLS LAST" }, { value: "FIRST", label: "NULLS FIRST" }]}
              style={{ width: 90 }}
            />
            <button onClick={() => removeCol(i)} style={{ color: "var(--danger)", cursor: "default" }}>×</button>
          </div>
        ))}
        {index.columns.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No columns</p>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>WHERE clause (partial index)</span>
        <input style={inputStyle} value={index.whereClause ?? ""}
          placeholder="e.g. status = 'active'"
          onChange={(e) => onChange({ whereClause: e.target.value || null })} />
      </div>
    </div>
  );
}

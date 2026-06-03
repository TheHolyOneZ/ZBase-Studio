import type { PgDraftTable, PgDraftUnique, PgDraftCheck } from "../../../types/pgBuilder";

interface Props {
  table: PgDraftTable;
  onChange: (patch: Partial<PgDraftTable>) => void;
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

export default function PgConstraintsPanel({ table, onChange }: Props) {
  function addUnique() {
    const u: PgDraftUnique = { id: crypto.randomUUID(), name: null, columns: [] };
    onChange({ uniques: [...table.uniques, u] });
  }

  function addCheck() {
    const ch: PgDraftCheck = { id: crypto.randomUUID(), name: null, expr: "" };
    onChange({ checks: [...table.checks, ch] });
  }

  function removeUnique(id: string) {
    onChange({ uniques: table.uniques.filter((u) => u.id !== id) });
  }

  function removeCheck(id: string) {
    onChange({ checks: table.checks.filter((ch) => ch.id !== id) });
  }

  function patchUnique(id: string, patch: Partial<PgDraftUnique>) {
    onChange({ uniques: table.uniques.map((u) => u.id === id ? { ...u, ...patch } : u) });
  }

  function patchCheck(id: string, patch: Partial<PgDraftCheck>) {
    onChange({ checks: table.checks.map((ch) => ch.id === id ? { ...ch, ...patch } : ch) });
  }

  return (
    <div className="flex flex-col gap-4">

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>UNIQUE</span>
          <button
            onClick={addUnique}
            style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }}
          >+ Add UNIQUE</button>
        </div>
        {table.uniques.map((u) => (
          <div key={u.id} className="flex items-center gap-2 mb-1">
            <input
              style={{ ...inputStyle, width: 120 }}
              value={u.name ?? ""}
              placeholder="constraint name (optional)"
              onChange={(e) => patchUnique(u.id, { name: e.target.value || null })}
            />
            <input
              style={inputStyle}
              value={u.columns.join(", ")}
              placeholder="col1, col2, …"
              onChange={(e) => patchUnique(u.id, { columns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
            <button
              onClick={() => removeUnique(u.id)}
              style={{ color: "var(--danger)", cursor: "default", flexShrink: 0 }}
            >×</button>
          </div>
        ))}
        {table.uniques.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No UNIQUE constraints</p>
        )}
      </div>


      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>CHECK</span>
          <button
            onClick={addCheck}
            style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }}
          >+ Add CHECK</button>
        </div>
        {table.checks.map((ch) => (
          <div key={ch.id} className="flex items-center gap-2 mb-1">
            <input
              style={{ ...inputStyle, width: 140 }}
              value={ch.name ?? ""}
              placeholder="constraint name (optional)"
              onChange={(e) => patchCheck(ch.id, { name: e.target.value || null })}
            />
            <input
              style={inputStyle}
              value={ch.expr}
              placeholder="expression, e.g. age > 0"
              onChange={(e) => patchCheck(ch.id, { expr: e.target.value })}
            />
            <button
              onClick={() => removeCheck(ch.id)}
              style={{ color: "var(--danger)", cursor: "default", flexShrink: 0 }}
            >×</button>
          </div>
        ))}
        {table.checks.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No CHECK constraints</p>
        )}
      </div>
    </div>
  );
}

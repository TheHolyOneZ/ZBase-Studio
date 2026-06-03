import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { PgDraftEnum } from "../../../types/pgBuilder";
import { SelectInput } from "../../common/FormControls";

interface Props {
  enum_: PgDraftEnum;
  availableSchemas: string[];
  onChange: (patch: Partial<PgDraftEnum>) => void;
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

export default function PgEnumEditor({ enum_: e, availableSchemas, onChange }: Props) {
  const [newVal, setNewVal] = useState("");

  function addValue() {
    const v = newVal.trim();
    if (!v || e.values.includes(v)) return;
    onChange({ values: [...e.values, v] });
    setNewVal("");
  }

  function removeValue(idx: number) {
    onChange({ values: e.values.filter((_, i) => i !== idx) });
  }

  function renameValue(idx: number, val: string) {
    const next = [...e.values];
    next[idx] = val;
    onChange({ values: next });
  }

  return (
    <div className="flex flex-col px-4 py-3 gap-3">
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Schema</span>
          <SelectInput<string>
            value={e.schema}
            onChange={(v) => onChange({ schema: v })}
            options={availableSchemas.map((s) => ({ value: s, label: s }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Type name</span>
          <input style={inputStyle} value={e.name} placeholder="my_status"
            onChange={(ev) => onChange({ name: ev.target.value })} />
        </div>
      </div>

      <div>
        <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>
          Values
        </span>
        {e.serverId && (
          <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>
            Existing values cannot be removed — PostgreSQL does not support dropping enum values.
          </p>
        )}
        <div className="flex flex-col gap-1 mt-1">
          {e.values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)" }}
                value={v}
                onChange={(ev) => renameValue(i, ev.target.value)}
                disabled={!!e.serverId}
              />
              {!e.serverId && (
                <button
                  onClick={() => removeValue(i)}
                  style={{ color: "var(--danger)", flexShrink: 0, cursor: "default" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {e.values.length === 0 && (
            <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>No values yet</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)" }}
          value={newVal}
          onChange={(ev) => setNewVal(ev.target.value)}
          placeholder="new_value"
          onKeyDown={(ev) => { if (ev.key === "Enter") addValue(); }}
        />
        <button
          onClick={addValue}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default shrink-0"
          style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
        >
          <Plus size={11} /> Add
        </button>
      </div>
    </div>
  );
}

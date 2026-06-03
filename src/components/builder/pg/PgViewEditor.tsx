import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { defineMonacoTheme } from "../../../lib/monacoSqlite";
import type { PgDraftView } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

const BG = "#0B0F14";

interface Props {
  view: PgDraftView;
  availableSchemas: string[];
  onChange: (patch: Partial<PgDraftView>) => void;
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

export default function PgViewEditor({ view, availableSchemas, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3">
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Schema</span>
          <SelectInput<string>
            value={view.schema}
            onChange={(v) => onChange({ schema: v })}
            options={availableSchemas.map((s) => ({ value: s, label: s }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>View name</span>
          <input style={inputStyle} value={view.name} placeholder="view_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
            <Checkbox checked={view.materialized} onChange={(v) => onChange({ materialized: v })} />
            MATERIALIZED
          </label>
        </div>
      </div>
      <div className="flex-1 min-h-0 rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={view.sql}
          beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
          onChange={(v) => onChange({ sql: v ?? "" })}
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}

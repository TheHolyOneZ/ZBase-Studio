import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { defineMonacoTheme } from "../../../lib/monacoSqlite";
import type { PgDraftFunction } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

const BG = "#0B0F14";

interface Props {
  fn: PgDraftFunction;
  availableSchemas: string[];
  onChange: (patch: Partial<PgDraftFunction>) => void;
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

export default function PgFunctionEditor({ fn, availableSchemas, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3">
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Schema</span>
          <SelectInput<string>
            value={fn.schema}
            onChange={(v) => onChange({ schema: v })}
            options={availableSchemas.map((s) => ({ value: s, label: s }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Function name</span>
          <input style={inputStyle} value={fn.name} placeholder="function_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Language</span>
          <SelectInput<"plpgsql" | "sql">
            value={fn.language}
            onChange={(v) => onChange({ language: v })}
            options={[{ value: "plpgsql", label: "PL/pgSQL" }, { value: "sql", label: "SQL" }]}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>RETURNS <span style={{ fontWeight: 400 }}>(e.g. void, integer, text, TABLE(...))</span></span>
          <input
            style={{ ...inputStyle, opacity: fn.returnsTrigger ? 0.4 : 1 }}
            value={fn.returnsTrigger ? "trigger" : (fn.returns ?? "void")}
            disabled={fn.returnsTrigger}
            placeholder="void"
            onChange={(e) => onChange({ returns: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Parameters <span style={{ fontWeight: 400 }}>(e.g. id integer, name text)</span></span>
          <input style={inputStyle} value={fn.parameters ?? ""} placeholder="leave empty for no parameters"
            onChange={(e) => onChange({ parameters: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
          <Checkbox checked={fn.returnsTrigger} onChange={(v) => onChange({ returnsTrigger: v, returns: v ? "trigger" : (fn.returns === "trigger" ? "void" : fn.returns) })} />
          Returns TRIGGER (for trigger functions)
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
          <Checkbox checked={!!fn.securityDefiner} onChange={(v) => onChange({ securityDefiner: v })} />
          SECURITY DEFINER (run as owner)
        </label>
      </div>
      <div className="flex-1 min-h-0 rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={fn.body}
          beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
          onChange={(v) => onChange({ body: v ?? "" })}
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

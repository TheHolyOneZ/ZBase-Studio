import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { defineMonacoTheme } from "../../../lib/monacoSqlite";
import type { MysqlDraftRoutine } from "../../../types/mysqlBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

const BG = "#0B0F14";

interface Props {
  routine: MysqlDraftRoutine;
  onChange: (patch: Partial<MysqlDraftRoutine>) => void;
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

export default function MysqlRoutineEditor({ routine, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3">
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Kind</span>
          <SelectInput<"FUNCTION" | "PROCEDURE">
            value={routine.kind}
            onChange={(v) => onChange({ kind: v, returns: v === "PROCEDURE" ? null : (routine.returns ?? "") })}
            options={[{ value: "FUNCTION", label: "FUNCTION" }, { value: "PROCEDURE", label: "PROCEDURE" }]}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5 col-span-2">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Name</span>
          <input style={inputStyle} value={routine.name} placeholder="routine_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-0.5 shrink-0">
        <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
          Parameters <span style={{ fontWeight: 400 }}>(e.g. IN id INT, OUT result TEXT)</span>
        </span>
        <input style={inputStyle} value={routine.parameters} placeholder="leave empty for no parameters"
          onChange={(e) => onChange({ parameters: e.target.value })} />
      </div>

      {routine.kind === "FUNCTION" && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>RETURNS type</span>
          <input style={inputStyle} value={routine.returns ?? ""} placeholder="e.g. INT, VARCHAR(255)"
            onChange={(e) => onChange({ returns: e.target.value || null })} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 shrink-0">
        <label className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
          <Checkbox checked={routine.deterministic} onChange={(v) => onChange({ deterministic: v })} />
          DETERMINISTIC
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Data access</span>
          <SelectInput<MysqlDraftRoutine["dataAccess"]>
            value={routine.dataAccess}
            onChange={(v) => onChange({ dataAccess: v })}
            options={[
              { value: "CONTAINS SQL", label: "CONTAINS SQL" },
              { value: "NO SQL", label: "NO SQL" },
              { value: "READS SQL DATA", label: "READS SQL DATA" },
              { value: "MODIFIES SQL DATA", label: "MODIFIES SQL DATA" },
            ]}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>SQL SECURITY</span>
          <SelectInput<"DEFINER" | "INVOKER">
            value={routine.sqlSecurity}
            onChange={(v) => onChange({ sqlSecurity: v })}
            options={[{ value: "DEFINER", label: "DEFINER" }, { value: "INVOKER", label: "INVOKER" }]}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={routine.body}
          beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
          onChange={(v) => onChange({ body: v ?? "" })}
          options={{ fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: "on" }}
        />
      </div>
    </div>
  );
}

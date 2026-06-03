import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { defineMonacoTheme } from "../../../lib/monacoSqlite";
import type { MysqlDraftTrigger, MysqlDraftTable } from "../../../types/mysqlBuilder";
import { SelectInput } from "../../common/FormControls";

const BG = "#0B0F14";

interface Props {
  trigger: MysqlDraftTrigger;
  allTables: MysqlDraftTable[];
  onChange: (patch: Partial<MysqlDraftTrigger>) => void;
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

export default function MysqlTriggerEditor({ trigger, allTables, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3">
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Trigger name</span>
          <input style={inputStyle} value={trigger.name} placeholder="trigger_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Table</span>
          <SelectInput<string>
            value={trigger.table}
            onChange={(v) => onChange({ table: v })}
            options={[{ value: "", label: "— select table —" }, ...allTables.map((t) => ({ value: t.name, label: t.name }))]}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Timing</span>
          <SelectInput<"BEFORE" | "AFTER">
            value={trigger.timing}
            onChange={(v) => onChange({ timing: v })}
            options={[{ value: "BEFORE", label: "BEFORE" }, { value: "AFTER", label: "AFTER" }]}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Event</span>
          <SelectInput<"INSERT" | "UPDATE" | "DELETE">
            value={trigger.event}
            onChange={(v) => onChange({ event: v })}
            options={[
              { value: "INSERT", label: "INSERT" },
              { value: "UPDATE", label: "UPDATE" },
              { value: "DELETE", label: "DELETE" },
            ]}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <p className="text-[10px] shrink-0" style={{ color: "var(--fg-subtle)" }}>
        MySQL triggers fire FOR EACH ROW only. One event per trigger.
      </p>
      <div className="flex-1 min-h-0 rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={trigger.body}
          beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
          onChange={(v) => onChange({ body: v ?? "" })}
          options={{ fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: "on" }}
        />
      </div>
    </div>
  );
}

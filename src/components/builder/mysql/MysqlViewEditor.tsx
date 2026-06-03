import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { defineMonacoTheme } from "../../../lib/monacoSqlite";
import type { MysqlDraftView } from "../../../types/mysqlBuilder";

const BG = "#0B0F14";

interface Props {
  view: MysqlDraftView;
  onChange: (patch: Partial<MysqlDraftView>) => void;
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

export default function MysqlViewEditor({ view, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-3 gap-3">
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>View name</span>
          <input style={inputStyle} value={view.name} placeholder="view_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Database</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-2)", color: "var(--fg-subtle)", border: "1px solid var(--border)" }}>
            {view.schema || "—"}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={view.body}
          beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
          onChange={(v) => onChange({ body: v ?? "" })}
          options={{ fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: "on" }}
        />
      </div>
    </div>
  );
}

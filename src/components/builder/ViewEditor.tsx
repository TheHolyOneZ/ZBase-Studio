import type { DraftView } from "../../types/builder";
import { TextInput, FieldLabel } from "../common/FormControls";
import MonacoEditor from "@monaco-editor/react";
import { defineMonacoTheme } from "../../lib/monacoSqlite";
import type * as Monaco from "monaco-editor";

interface Props {
  view: DraftView;
  onChange: (patch: Partial<DraftView>) => void;
}

export default function ViewEditor({ view, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex flex-col gap-1">
        <FieldLabel>View name</FieldLabel>
        <TextInput value={view.name} onChange={(v) => onChange({ name: v })} placeholder="my_view" monospace />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <FieldLabel>AS SELECT …</FieldLabel>
        <div className="flex-1 rounded overflow-hidden" style={{ border: "1px solid var(--border)", minHeight: 200, background: "#0B0F14" }}>
          <MonacoEditor
            height="100%"
            language="sql"
            theme="zbase-dark"
            value={view.sql}
            onChange={(v) => onChange({ sql: v ?? "" })}
            beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "on",
              wordWrap: "on",
            }}
          />
        </div>
      </div>
    </div>
  );
}

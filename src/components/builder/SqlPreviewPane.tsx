import MonacoEditor from "@monaco-editor/react";
import { buildDdl } from "../../lib/buildDdl";
import type { BuilderDraft } from "../../types/builder";
import { AlertTriangle } from "lucide-react";
import { defineMonacoTheme } from "../../lib/monacoSqlite";
import type * as Monaco from "monaco-editor";

const BG = "#0B0F14";

interface Props {
  draft: BuilderDraft;
}

export default function SqlPreviewPane({ draft }: Props) {
  const { sql, errors } = buildDdl(draft);

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: "1px solid var(--border)" }}>
      <div
        className="px-3 py-1.5 shrink-0 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>
          SQL Preview
        </span>
        {errors.length > 0 && (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={10} /> {errors.length} issue{errors.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0" style={{ background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={sql || "-- Start adding tables to see the generated DDL"}
          beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
          options={{
            readOnly: true,
            fontSize: 11,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "off",
            folding: false,
            wordWrap: "off",
            domReadOnly: true,
          }}
        />
      </div>
      {errors.length > 0 && (
        <div
          className="shrink-0 max-h-32 overflow-y-auto"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-2)" }}
        >
          {errors.map((err, i) => (
            <div key={i} className="px-3 py-1 text-[11px] flex items-start gap-1.5" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={10} className="mt-0.5 shrink-0" />
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

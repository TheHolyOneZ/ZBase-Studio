import { useMemo } from "react";
import MonacoEditor from "@monaco-editor/react";
import { AlertTriangle } from "lucide-react";
import type * as Monaco from "monaco-editor";
import { defineMonacoTheme } from "../../../lib/monacoSqlite";
import type { PgBuilderDraft, DestructiveOp, PgDraftError } from "../../../types/pgBuilder";
import type { PgSchemaSnapshot } from "../../../types/pgSchema";
import { diffPgDraft } from "../../../lib/buildPgDdl";

const BG = "#0B0F14";

interface Props {
  draft: PgBuilderDraft;
  snapshot: PgSchemaSnapshot;
  failingStatementIndex?: number;
  failingError?: string;
}

export default function PgDdlPreviewPane({ draft, snapshot, failingStatementIndex, failingError }: Props) {
  const diff = useMemo(() => diffPgDraft(snapshot, draft), [snapshot, draft]);

  const displaySql = diff.sql || "-- No changes";
  const stmtCount = diff.statements.length;
  const errCount = diff.errors.length;

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: "1px solid var(--border)" }}>
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0 text-xs"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>
          SQL Preview
        </span>
        <span style={{ color: errCount > 0 ? "var(--danger)" : stmtCount > 0 ? "var(--accent)" : "var(--fg-subtle)", fontSize: 10 }}>
          {errCount > 0
            ? `${errCount} error${errCount !== 1 ? "s" : ""}`
            : stmtCount > 0
              ? `${stmtCount} statement${stmtCount !== 1 ? "s" : ""}`
              : "No changes"}
        </span>
      </div>

      {diff.destructive.length > 0 && (
        <div
          className="px-3 py-2 flex flex-col gap-1 shrink-0"
          style={{ background: "rgba(224,60,0,0.08)", borderBottom: "1px solid rgba(224,60,0,0.2)" }}
        >
          <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#E03C00" }}>
            <AlertTriangle size={10} />
            Destructive changes
          </div>
          {diff.destructive.map((op: DestructiveOp, i: number) => (
            <p key={i} className="text-[10px]" style={{ color: "#E03C00" }}>• {op.message}</p>
          ))}
        </div>
      )}

      {failingStatementIndex !== undefined && failingError && (
        <div className="px-3 py-2 shrink-0" style={{ background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.2)" }}>
          <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--danger)" }}>Apply failed at statement {failingStatementIndex + 1}:</p>
          <p className="text-[10px]" style={{ color: "var(--danger)" }}>{failingError}</p>
        </div>
      )}

      <div className="flex-1 min-h-0" style={{ background: BG }}>
        <MonacoEditor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={displaySql}
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

      {diff.errors.length > 0 && (
        <div className="shrink-0 max-h-32 overflow-y-auto" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-2)" }}>
          {diff.errors.map((e: PgDraftError, i: number) => (
            <div key={i} className="px-3 py-1 text-[11px]" style={{ color: "var(--danger)" }}>• {e.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}

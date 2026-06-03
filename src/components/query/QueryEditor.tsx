import { useEffect, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useStore } from "../../store";
import { modLabel } from "../../lib/platform";
import { defineMonacoTheme, registerSqliteCompletions } from "../../lib/monacoSqlite";
import { engineQueryOps } from "../../lib/engineOps";
import { Play } from "lucide-react";
import ResultsPanel from "./ResultsPanel";
import type { QueryResult } from "../../types/ipc";
import { extractError } from "../../lib/extractError";

interface QueryEditorProps {
  tabId: string;
}

export default function QueryEditor({ tabId }: QueryEditorProps) {
  const monaco = useMonaco();
  const { queryContent, setQueryContent, schemas, pushQueryHistory, fontSize, tabs, setSchema } = useStore();
  const engine = tabs.find((t) => t.id === tabId)?.engine ?? "sqlite";
  const qops = engineQueryOps(engine);
  const content = queryContent[tabId] ?? "";
  const schema = schemas[tabId];
  const completionsRef = useRef<ReturnType<typeof registerSqliteCompletions> | null>(null);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [lastSql, setLastSql] = useState<string>("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!monaco) return;
    defineMonacoTheme(monaco);
    completionsRef.current?.dispose();
    completionsRef.current = registerSqliteCompletions(monaco, () => schema);
    return () => completionsRef.current?.dispose();
  }, [monaco, schema]);

  async function runQuery() {
    const sql = content.trim();
    if (!sql) return;
    setRunning(true);
    setQueryError(null);
    try {
      const r = await qops.execute(tabId, sql);
      setResult(r as QueryResult);
      setLastSql(sql);
      pushQueryHistory(tabId, sql);

      setSchema(tabId, await qops.getSchema(tabId));
    } catch (e) {
      setQueryError(extractError(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }


  const runQueryRef = useRef(runQuery);
  runQueryRef.current = runQuery;

  return (
    <div className="flex flex-col h-full">

      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-1)" }}
      >
        <button
          onClick={runQuery}
          disabled={running}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-[var(--r-sm)] font-medium transition-all cursor-default disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#0B0F14" }}
        >
          <Play size={11} />
          Run
        </button>
        <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
          {modLabel("Enter")} to run
        </span>
      </div>


      <div className="flex-1 min-h-0" style={{ borderBottom: "1px solid var(--border)", background: "#0B0F14" }}>
        <Editor
          height="100%"
          language="sql"
          theme="zbase-dark"
          value={content}
          onChange={(val) => setQueryContent(tabId, val ?? "")}
          beforeMount={(m) => defineMonacoTheme(m)}
          options={{
            fontSize,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            renderLineHighlight: "line",
            padding: { top: 8, bottom: 8 },
          }}
          onMount={(editor, monacoInst) => {

            editor.addCommand(
              monacoInst.KeyMod.CtrlCmd | monacoInst.KeyCode.Enter,
              () => runQueryRef.current(),
            );
          }}
        />
      </div>


      <ResultsPanel result={result} error={queryError} loading={running} sql={lastSql} />
    </div>
  );
}

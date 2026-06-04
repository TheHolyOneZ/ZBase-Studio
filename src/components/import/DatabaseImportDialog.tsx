import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FileText, CheckCircle2, AlertTriangle, X, ChevronDown, ChevronRight } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Spinner from "../common/Spinner";
import { executePgSqlFile, executeMysqlSqlFile, getPgSchema, getMysqlSchema } from "../../ipc/commands";
import { onImportProgress, onImportDone } from "../../ipc/events";
import { extractError } from "../../lib/extractError";
import { useStore } from "../../store";
import type { ImportSqlResult } from "../../ipc/commands";

interface DatabaseImportDialogProps {
  open: boolean;
  onClose: () => void;
  tabId: string;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs select-none" style={{ color: "var(--fg-muted)" }}>
      <button
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="w-3.5 h-3.5 rounded-sm flex items-center justify-center transition-all cursor-default shrink-0"
        style={{
          background: checked ? "var(--accent)" : "var(--bg-0)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        }}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {label}
    </label>
  );
}

function ErrorList({ errors }: { errors: ImportSqlResult["errors"] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? errors : errors.slice(0, 3);
  return (
    <div className="flex flex-col gap-1">
      {shown.map((e) => (
        <div key={e.index} className="rounded p-2 text-[10px] font-mono" style={{ background: "var(--bg-0)", border: "1px solid var(--danger-subtle, rgba(248,113,113,0.2))" }}>
          <p className="text-[10px] mb-0.5" style={{ color: "var(--danger, #F87171)", fontFamily: "inherit" }}>
            Statement #{e.index + 1}
          </p>
          <p className="truncate mb-0.5" style={{ color: "var(--fg-muted)" }}>{e.preview}{e.preview.length >= 120 ? "…" : ""}</p>
          <p style={{ color: "var(--fg-subtle)" }}>{e.message}</p>
        </div>
      ))}
      {errors.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[10px] cursor-default"
          style={{ color: "var(--fg-subtle)" }}
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {expanded ? "Show fewer" : `Show ${errors.length - 3} more error${errors.length - 3 !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

export default function DatabaseImportDialog({ open: isOpen, onClose, tabId }: DatabaseImportDialogProps) {
  const { addToast, tabs, setSchema } = useStore();
  const tab = tabs.find((t) => t.id === tabId);

  const [filePath,    setFilePath]    = useState<string | null>(null);
  const [stopOnError, setStopOnError] = useState(false);
  const [running,     setRunning]     = useState(false);
  const [progress,    setProgress]    = useState<{ done: number; total: number } | null>(null);
  const [result,      setResult]      = useState<ImportSqlResult | null>(null);

  const unsubsRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFilePath(null);
      setRunning(false);
      setProgress(null);
      setResult(null);
    }
  }, [isOpen]);


  useEffect(() => {
    return () => { unsubsRef.current.forEach((u) => u()); };
  }, []);

  const engine = tab?.engine ?? "";
  const isPostgres = engine === "postgres";
  const isMysql    = engine === "mysql" || engine === "mariadb";
  const engineLabel = isPostgres ? "PostgreSQL" : engine === "mariadb" ? "MariaDB" : "MySQL";

  async function handleBrowse() {
    const picked = await open({
      filters: [{ name: "SQL Script", extensions: ["sql", "txt"] }],
      multiple: false,
    });
    if (typeof picked === "string") setFilePath(picked);
  }

  async function handleImport() {
    if (!filePath) return;


    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    setRunning(true);
    setProgress(null);
    setResult(null);

    const unsub1 = await onImportProgress(tabId, (done, total) =>
      setProgress({ done, total }),
    );
    const unsub2 = await onImportDone(tabId, () => {});
    unsubsRef.current = [unsub1, unsub2];

    try {
      let res: ImportSqlResult;
      if (isPostgres) {
        res = await executePgSqlFile(tabId, filePath, stopOnError);
      } else {
        res = await executeMysqlSqlFile(tabId, filePath, stopOnError);
      }
      setResult(res);


      try {
        if (isPostgres) {
          const schema = await getPgSchema(tabId);
          setSchema(tabId, schema);
        } else {
          const schema = await getMysqlSchema(tabId);
          setSchema(tabId, schema);
        }
      } catch {

      }
    } catch (e) {
      addToast({ type: "error", message: `Import failed: ${extractError(e)}` });
    } finally {
      setRunning(false);
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    }
  }

  const fileName = filePath ? filePath.replace(/\\/g, "/").split("/").pop() : null;
  const succeeded = result !== null && result.failed === 0;
  const hasErrors = result !== null && result.failed > 0;

  const footer = result ? (
    <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
  ) : running ? (
    <Button variant="ghost" size="sm" onClick={onClose} disabled><X size={12} /> Running…</Button>
  ) : (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="sm" onClick={handleImport} disabled={!filePath}>
        Import
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Import SQL — ${tab?.label ?? engineLabel}`}
      width={520}
      footer={footer}
    >
      <div className="flex flex-col gap-3">


        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>
            SQL file
          </p>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)] text-xs truncate"
              style={{ background: "var(--bg-0)", border: "1px solid var(--border)", color: fileName ? "var(--fg-0)" : "var(--fg-subtle)" }}
            >
              <FileText size={12} style={{ flexShrink: 0, color: "var(--fg-subtle)" }} />
              <span className="truncate">{fileName ?? "No file selected"}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleBrowse} disabled={running}>
              Browse…
            </Button>
          </div>
        </div>


        <div className="rounded-[var(--r-sm)] p-3 flex flex-col gap-1" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>
            {engineLabel} SQL import
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {isPostgres
              ? "Splits on semicolons, respects dollar-quoted strings ($$…$$), single-quoted literals, and -- / /* */ comments. Statements are executed one by one."
              : "Splits on the current DELIMITER (default ;), handles DELIMITER // for routines, backtick identifiers, # and -- comments. Statements are executed one by one."}
          </p>
        </div>


        <Toggle
          label="Stop on first error (default: continue and collect all errors)"
          checked={stopOnError}
          onChange={setStopOnError}
        />


        {running && (
          <div className="rounded-[var(--r-sm)] p-3 flex items-center gap-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <Spinner size={14} />
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {progress
                ? `Executing statement ${progress.done} of ${progress.total}…`
                : "Reading file…"}
            </span>
          </div>
        )}


        {result && (
          <div className="flex flex-col gap-2">
            <div
              className="rounded-[var(--r-sm)] p-3 flex items-center gap-3"
              style={{ background: "var(--bg-2)", border: `1px solid ${succeeded ? "var(--border)" : "rgba(248,113,113,0.3)"}` }}
            >
              {succeeded ? (
                <CheckCircle2 size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
              ) : (
                <AlertTriangle size={16} style={{ color: "var(--warning, #E0A53A)", flexShrink: 0 }} />
              )}
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>
                  {succeeded
                    ? `${result.executed} statement${result.executed !== 1 ? "s" : ""} executed in ${result.duration_ms}ms`
                    : `${result.executed} executed, ${result.failed} failed — ${result.duration_ms}ms`}
                </p>
                {succeeded && (
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                    Schema refreshed. Check the sidebar for updated tables.
                  </p>
                )}
              </div>
            </div>

            {hasErrors && result.errors.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold" style={{ color: "var(--fg-subtle)" }}>Errors</p>
                <ErrorList errors={result.errors} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

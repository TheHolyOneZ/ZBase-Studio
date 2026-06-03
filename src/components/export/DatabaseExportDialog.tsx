import { useState, useEffect, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { copyFile } from "@tauri-apps/plugin-fs";
import { Database, HardDrive, CheckCircle2, X, ChevronDown, ChevronRight } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Spinner from "../common/Spinner";
import { exportDatabase } from "../../ipc/commands";
import { onExportProgress, onExportDone, onExportError } from "../../ipc/events";
import { cancelJob } from "../../ipc/commands";
import { extractError } from "../../lib/extractError";
import { useStore } from "../../store";
import type { DbExportRequest } from "../../ipc/commands";

interface DatabaseExportDialogProps {
  open: boolean;
  onClose: () => void;
  tabId: string;
}

type DbFormat = "sql" | "db";
type InsertMode = "insert" | "replace" | "ignore";
type ContentMode = "both" | "structure" | "data";


function Toggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center gap-2 cursor-pointer text-xs select-none"
      style={{ color: disabled ? "var(--fg-subtle)" : "var(--fg-muted)", pointerEvents: disabled ? "none" : undefined }}
    >
      <button
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="w-3.5 h-3.5 rounded-sm flex items-center justify-center transition-all cursor-default shrink-0"
        style={{
          background: checked && !disabled ? "var(--accent)" : "var(--bg-0)",
          border: `1px solid ${checked && !disabled ? "var(--accent)" : "var(--border)"}`,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {checked && !disabled && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {label}
    </label>
  );
}

function Section({ title, children, open: initOpen = true }: {
  title: string; children: React.ReactNode; open?: boolean;
}) {
  const [open, setOpen] = useState(initOpen);
  return (
    <div className="rounded-[var(--r-sm)] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide cursor-default select-none transition-colors"
        style={{ background: "var(--bg-2)", color: "var(--fg-subtle)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg-muted)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg-subtle)")}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {title}
      </button>
      {open && (
        <div className="p-3 flex flex-col gap-2.5" style={{ background: "var(--bg-1)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function RadioGroup<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className="flex-1 py-1 rounded text-xs cursor-default transition-all"
          style={{
            background: value === opt.id ? "var(--accent)" : "var(--bg-2)",
            color: value === opt.id ? "#0B0F14" : "var(--fg-muted)",
            border: `1px solid ${value === opt.id ? "var(--accent)" : "var(--border)"}`,
            fontWeight: value === opt.id ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


function DuckDbExportContent({ tab, onClose }: { tab: { label: string; path?: string }; onClose: () => void }) {
  const { addToast } = useStore();
  const [copying, setCopying] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSaveCopy() {
    if (!tab.path) {
      addToast({ type: "error", message: "No file path for this DuckDB connection" });
      return;
    }
    const defaultName = tab.label.replace(/\.duckdb$/i, "");
    const dest = await save({
      defaultPath: `${defaultName}_copy.duckdb`,
      filters: [{ name: "DuckDB Database", extensions: ["duckdb"] }],
    });
    if (!dest) return;
    setCopying(true);
    try {
      await copyFile(tab.path, dest);
      setDone(true);
      addToast({ type: "success", message: `Saved copy to ${dest.split("/").pop()}` });
    } catch (e) {
      addToast({ type: "error", message: extractError(e) });
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded p-3 flex flex-col gap-1.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>Save a copy of this DuckDB file</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Creates an exact copy of the <code style={{ background: "var(--bg-0)", padding: "1px 4px", borderRadius: 3 }}>.duckdb</code> file
          at a location you choose. The original file is not modified.
        </p>
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
          <CheckCircle2 size={14} /> Copy saved successfully.
        </div>
      ) : copying ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--fg-muted)" }}>
          <Spinner size={14} /> Copying…
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        {done
          ? <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
          : <Button variant="primary" size="sm" onClick={handleSaveCopy} disabled={copying}>
              {copying ? "Copying…" : "Save Copy…"}
            </Button>
        }
      </div>
    </div>
  );
}


export default function DatabaseExportDialog({ open, onClose, tabId }: DatabaseExportDialogProps) {
  const { addToast, tabs } = useStore();
  const tab = tabs.find((t) => t.id === tabId);


  if (tab?.engine === "duckdb") {
    return (
      <Modal open={open} onClose={onClose} title={`Export Database — ${tab.label}`} width={440}>
        <DuckDbExportContent tab={tab} onClose={onClose} />
      </Modal>
    );
  }


  const [format, setFormat] = useState<DbFormat>("sql");


  const [contentMode,     setContentMode]     = useState<ContentMode>("both");
  const [inclIndexes,     setInclIndexes]     = useState(true);
  const [inclViews,       setInclViews]       = useState(true);
  const [inclTriggers,    setInclTriggers]    = useState(true);


  const [dropTables,      setDropTables]      = useState(true);
  const [ifNotExists,     setIfNotExists]     = useState(false);


  const [insertMode,      setInsertMode]      = useState<InsertMode>("insert");
  const [batchSize,       setBatchSize]       = useState("500");
  const [wrapTxn,         setWrapTxn]         = useState(true);
  const [disableFk,       setDisableFk]       = useState(true);


  const [addComments,     setAddComments]     = useState(true);


  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [progress, setProgress] = useState<{ written: number; total: number } | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) { setRunning(false); setDone(false); setProgress(null); }
  }, [open]);

  const inclStructure = contentMode !== "data";
  const inclData      = contentMode !== "structure";

  async function handleExport() {
    const ext = format === "db" ? "db" : "sql";
    const defaultName = tab ? tab.label.replace(/\.(db|sqlite|sqlite3)$/i, "") : "database";
    const filePath = await save({
      defaultPath: `${defaultName}.${ext}`,
      filters: format === "db"
        ? [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }]
        : [{ name: "SQL Dump", extensions: ["sql"] }],
    });
    if (!filePath) return;

    setRunning(true);
    setDone(false);
    setProgress(null);


    const jid = crypto.randomUUID();
    jobRef.current = jid;
    const cleanup = () => { unsub1(); unsub2(); unsub3(); };
    const unsub1 = await onExportProgress(jid, (p) =>
      setProgress({ written: p.written, total: p.total_estimate }),
    );
    const unsub2 = await onExportDone(jid, () => { setRunning(false); setDone(true); cleanup(); });
    const unsub3 = await onExportError(jid, (msg) => {
      setRunning(false);
      addToast({ type: "error", message: `Export failed: ${msg}` });
      cleanup();
    });

    const req: DbExportRequest & { job_id: string } = {
      tab_id: tabId,
      format,
      path: filePath,
      job_id: jid,
      include_structure: inclStructure,
      include_data: inclData,
      include_indexes: inclIndexes,
      include_views: inclViews,
      include_triggers: inclTriggers,
      drop_tables: dropTables,
      if_not_exists: ifNotExists,
      insert_mode: insertMode,
      batch_size: Math.max(1, Math.min(5000, parseInt(batchSize) || 500)),
      wrap_transaction: wrapTxn,
      disable_fk_checks: disableFk,
      add_comments: addComments,
    };

    try {
      await exportDatabase(req);
    } catch (e) {
      setRunning(false);
      cleanup();
      addToast({ type: "error", message: extractError(e) });
    }
  }

  async function handleCancel() {
    if (jobRef.current) {
      await cancelJob(jobRef.current).catch(() => {});
      setRunning(false);
    }
  }

  const footer = done ? (
    <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
  ) : running ? (
    <Button variant="danger" size="sm" onClick={handleCancel}><X size={12} /> Cancel</Button>
  ) : (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="sm" onClick={handleExport}>Export Database</Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Export Database${tab ? ` — ${tab.label}` : ""}`}
      width={500}
      footer={footer}
    >
      <div className="flex flex-col gap-3" style={{ maxHeight: "70vh", overflowY: "auto" }}>


        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "sql" as DbFormat, icon: <Database size={16} />, label: "SQL Dump", desc: ".sql — portable text dump" },
            { id: "db"  as DbFormat, icon: <HardDrive size={16} />, label: "SQLite File", desc: ".db — live binary backup" },
          ] as const).map((f) => {
            const active = format === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className="flex items-center gap-2.5 p-2.5 rounded-[var(--r-sm)] text-left cursor-default transition-all"
                style={{
                  background: active ? "var(--accent-soft)" : "var(--bg-2)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span style={{ color: active ? "var(--accent)" : "var(--fg-subtle)", flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <p className="text-xs font-semibold" style={{ color: active ? "var(--accent)" : "var(--fg-0)" }}>{f.label}</p>
                  <p className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>{f.desc}</p>
                </div>
              </button>
            );
          })}
        </div>


        {format === "db" && !running && !done && (
          <div
            className="rounded-[var(--r-sm)] p-3 flex flex-col gap-1.5"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--fg-0)" }}>What this does</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              Creates a byte-perfect copy of the entire database — all tables, indexes, views,
              triggers, and every row of data — as a standalone <code style={{ background: "var(--bg-0)", padding: "1px 4px", borderRadius: 3 }}>.db</code> file.
              Uses SQLite's online backup API, so it&apos;s safe while the database is open.
            </p>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              Click <strong style={{ color: "var(--fg-muted)" }}>Export Database</strong> below to choose where to save it.
            </p>
          </div>
        )}

        {/* ── SQL-only settings ── */}
        {format === "sql" && (
          <>
            {/* Content */}
            <Section title="Content">
              <RadioGroup<ContentMode>
                value={contentMode}
                onChange={setContentMode}
                options={[
                  { id: "both",      label: "Structure + Data" },
                  { id: "structure", label: "Structure only" },
                  { id: "data",      label: "Data only" },
                ]}
              />
            </Section>

            {/* Object types */}
            <Section title="Object types">
              <div className="grid grid-cols-2 gap-2">
                {/* Tables are always exported — not optional */}
                <div className="flex items-center gap-2 text-xs select-none" style={{ color: "var(--fg-muted)" }}>
                  <span
                    className="w-3.5 h-3.5 rounded-sm flex items-center justify-center shrink-0"
                    style={{ background: "var(--accent)", border: "1px solid var(--accent)" }}
                  >
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  Tables <span style={{ color: "var(--fg-subtle)", fontSize: 10 }}>(always)</span>
                </div>
                <Toggle label="Indexes"  checked={inclIndexes}  onChange={setInclIndexes}  disabled={!inclStructure} />
                <Toggle label="Views"    checked={inclViews}    onChange={setInclViews} />
                <Toggle label="Triggers" checked={inclTriggers} onChange={setInclTriggers} />
              </div>
            </Section>

            {/* Structure options */}
            {inclStructure && (
              <Section title="Structure options">
                <div className="grid grid-cols-2 gap-2">
                  <Toggle label="DROP TABLE first"   checked={dropTables}   onChange={setDropTables} />
                  <Toggle label="IF NOT EXISTS"      checked={ifNotExists}  onChange={setIfNotExists} />
                  <Toggle label="Header comments"    checked={addComments}  onChange={setAddComments} />
                </div>
              </Section>
            )}

            {/* Data options */}
            {inclData && (
              <Section title="Data options">
                <div>
                  <p className="text-[10px] mb-1.5" style={{ color: "var(--fg-subtle)" }}>INSERT mode</p>
                  <RadioGroup<InsertMode>
                    value={insertMode}
                    onChange={setInsertMode}
                    options={[
                      { id: "insert",  label: "INSERT" },
                      { id: "replace", label: "OR REPLACE" },
                      { id: "ignore",  label: "OR IGNORE" },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Toggle label="Wrap in transaction"    checked={wrapTxn}   onChange={setWrapTxn} />
                  <Toggle label="Disable FK checks"      checked={disableFk} onChange={setDisableFk} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs shrink-0" style={{ color: "var(--fg-muted)" }}>Rows per INSERT</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                    className="w-20 px-2 py-1 rounded text-xs outline-none"
                    style={{ background: "var(--bg-0)", border: "1px solid var(--border)", color: "var(--fg-0)" }}
                  />
                  <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                    (1 – 5000)
                  </span>
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Progress ── */}
        {(running || done) && (
          <div
            className="rounded-[var(--r-sm)] p-3 flex items-center gap-3"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            {done ? (
              <>
                <CheckCircle2 size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span className="text-xs" style={{ color: "var(--fg-0)" }}>
                  {format === "db"
                    ? "Backup complete"
                    : `Dump complete — ${progress?.total ?? "?"} tables`}
                </span>
              </>
            ) : (
              <>
                <Spinner size={14} />
                <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {format === "db"
                    ? "Copying database…"
                    : progress
                    ? `Exporting table ${progress.written + 1} of ${progress.total}…`
                    : "Starting…"}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

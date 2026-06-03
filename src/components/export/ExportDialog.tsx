import { useState, useEffect, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, X, CheckCircle2 } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Spinner from "../common/Spinner";
import { startExport, cancelJob } from "../../ipc/commands";
import { extractError } from "../../lib/extractError";
import { onExportProgress, onExportDone, onExportError } from "../../ipc/events";
import { useStore } from "../../store";
import type { ExportFormatId } from "../../types/ipc";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  tabId: string;
  table: string;
}

interface FormatMeta {
  id: ExportFormatId;
  label: string;
  ext: string;
  desc: string;
}

const FORMATS: FormatMeta[] = [
  { id: "csv",      label: "CSV",          ext: "csv",  desc: "Comma-separated, UTF-8" },
  { id: "csv_excel",label: "CSV (Excel)",  ext: "csv",  desc: "Semicolons + BOM" },
  { id: "tsv",      label: "TSV",          ext: "tsv",  desc: "Tab-separated" },
  { id: "json",     label: "JSON",         ext: "json", desc: "Array of objects" },
  { id: "sql",      label: "SQL Dump",     ext: "sql",  desc: "CREATE + INSERT" },
  { id: "xml",      label: "XML",          ext: "xml",  desc: "Row-based XML" },
  { id: "yaml",     label: "YAML",         ext: "yaml", desc: "Array of mappings" },
  { id: "markdown", label: "Markdown",     ext: "md",   desc: "Pipe table" },
];

export default function ExportDialog({ open, onClose, tabId, table }: ExportDialogProps) {
  const { addToast } = useStore();
  const [format, setFormat] = useState<ExportFormatId>("csv");

  const [inclStructure, setInclStructure] = useState(true);
  const [inclData, setInclData]           = useState(true);
  const [dropTable, setDropTable]         = useState(true);
  const [ifNotExists, setIfNotExists]     = useState(false);
  const [batchSize, setBatchSize]         = useState("500");

  const [running, setRunning]   = useState(false);
  const [done, setDone]         = useState(false);
  const [progress, setProgress] = useState(0);
  const jobRef = useRef<string | null>(null);


  useEffect(() => {
    if (open) { setRunning(false); setDone(false); setProgress(0); }
  }, [open]);

  async function handleExport() {
    const fmt = FORMATS.find(f => f.id === format)!;
    const filePath = await save({
      defaultPath: `${table}.${fmt.ext}`,
      filters: [{ name: fmt.label, extensions: [fmt.ext] }],
    });
    if (!filePath) return;

    setRunning(true);
    setDone(false);
    setProgress(0);


    const jid = crypto.randomUUID();
    jobRef.current = jid;
    const cleanup = () => { unsub1(); unsub2(); unsub3(); };
    const unsub1 = await onExportProgress(jid, (p) => setProgress(p.written));
    const unsub2 = await onExportDone(jid, () => { setRunning(false); setDone(true); cleanup(); });
    const unsub3 = await onExportError(jid, (msg) => {
      setRunning(false);
      addToast({ type: "error", message: `Export error: ${msg}` });
      cleanup();
    });

    try {
      await startExport({
        tab_id: tabId,
        sql: `SELECT * FROM "${table.replace(/"/g, '""')}"`,
        format,
        path: filePath,
        job_id: jid,
        table_name: table,
        include_structure: inclStructure,
        include_data: inclData,
        drop_table: dropTable,
        if_not_exists: ifNotExists,
        batch_size: parseInt(batchSize) || 500,
      } as Parameters<typeof startExport>[0]);
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
    <Button variant="danger" size="sm" onClick={handleCancel}>
      <X size={12} /> Cancel
    </Button>
  ) : (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="sm" onClick={handleExport}>
        <Download size={12} /> Export
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={`Export "${table}"`} width={520} footer={footer}>
      <div className="flex flex-col gap-4">
        {/* Format grid */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--fg-subtle)" }}>FORMAT</p>
          <div className="grid grid-cols-4 gap-1.5">
            {FORMATS.map((f) => {
              const active = f.id === format;
              return (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className="flex flex-col items-start px-2.5 py-2 rounded-[var(--r-sm)] text-left cursor-default transition-all"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--bg-2)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <span
                    className="text-xs font-semibold"
                    style={{ color: active ? "var(--accent)" : "var(--fg-0)" }}
                  >
                    {f.label}
                  </span>
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>
                    {f.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SQL dump options */}
        {format === "sql" && (
          <div
            className="rounded-[var(--r-sm)] p-3 flex flex-col gap-3"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--fg-subtle)" }}>SQL OPTIONS</p>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="CREATE TABLE" checked={inclStructure} onChange={setInclStructure} />
              <Toggle label="INSERT data"  checked={inclData}       onChange={setInclData} />
              <Toggle label="DROP TABLE first" checked={dropTable}   onChange={setDropTable} />
              <Toggle label="IF NOT EXISTS"    checked={ifNotExists} onChange={setIfNotExists} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--fg-muted)" }}>Rows per INSERT</label>
              <input
                type="number"
                min={1}
                max={5000}
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                className="w-20 px-2 py-1 rounded text-xs outline-none"
                style={{
                  background: "var(--bg-0)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-0)",
                }}
              />
            </div>
          </div>
        )}

        {/* Progress / done */}
        {(running || done) && (
          <div
            className="rounded-[var(--r-sm)] p-3 flex items-center gap-3"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            {done ? (
              <>
                <CheckCircle2 size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span className="text-xs" style={{ color: "var(--fg-0)" }}>
                  Export complete — {progress.toLocaleString()} rows written
                </span>
              </>
            ) : (
              <>
                <Spinner size={14} />
                <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {progress > 0 ? `${progress.toLocaleString()} rows written…` : "Starting…"}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: "var(--fg-muted)" }}>
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

import { useState, useRef, useEffect } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Spinner from "../common/Spinner";
import { useStore, useActiveTab } from "../../store";
import { inferCsvSchema, importCsv, openDb, getDbSchema } from "../../ipc/commands";
import { extractError } from "../../lib/extractError";
import { onImportProgress, onImportDone } from "../../ipc/events";
import type { CsvColumnPreview } from "../../ipc/commands";
import { Toggle, TextInput, FieldLabel, SelectInput } from "../common/FormControls";
import { CheckCircle2, FileInput } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = "pick" | "preview" | "importing" | "done";

export default function CsvImporter({ open: isOpen, onClose }: Props) {
  const { addToast, setSchema, addRecentFile, addTab } = useStore();
  const activeTab = useActiveTab();

  const unlistenRefs = useRef<Array<() => void>>([]);
  useEffect(() => {
    return () => {
      for (const unsub of unlistenRefs.current) unsub();
      unlistenRefs.current = [];
    };
  }, []);

  const [step, setStep] = useState<Step>("pick");
  const [filePath, setFilePath] = useState("");
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [columns, setColumns] = useState<CsvColumnPreview[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [tableName, setTableName] = useState("imported_data");
  const [target, setTarget] = useState<"new" | "active">("new");
  const [loading, setLoading] = useState(false);
  const [written, setWritten] = useState(0);

  function reset() {
    setStep("pick");
    setFilePath("");
    setDelimiter(",");
    setHasHeader(true);
    setColumns([]);
    setSampleRows([]);
    setTotalRows(0);
    setTableName("imported_data");
    setTarget("new");
    setLoading(false);
    setWritten(0);
  }

  async function handlePickFile() {
    const path = await openDialog({
      multiple: false,
      filters: [
        { name: "CSV files", extensions: ["csv", "tsv", "txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (!path || typeof path !== "string") return;
    setFilePath(path);
    const fname = path.replace(/\\/g, "/").split("/").pop() ?? "";
    const base = fname.replace(/\.(csv|tsv|txt)$/i, "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    setTableName(base || "imported_data");
    const detectedDelim = fname.endsWith(".tsv") ? "\\t" : ",";
    setDelimiter(detectedDelim);
    await doInfer(path, detectedDelim, hasHeader);
  }

  async function doInfer(path: string, delim: string, hdr: boolean) {
    setLoading(true);
    try {
      const result = await inferCsvSchema(path, delim, hdr);
      setColumns(result.columns);
      setSampleRows(result.sample_rows);
      setTotalRows(result.total_rows_estimate);
      setStep("preview");
    } catch (e) {
      addToast({ type: "error", message: `Failed to read CSV: ${extractError(e)}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setStep("importing");
    setWritten(0);

    let tabId = activeTab?.id ?? null;
    let newFilePath: string | null = null;

    try {
      if (target === "new") {
        const dest = await saveDialog({
          defaultPath: `${tableName}.db`,
          filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
        });
        if (!dest) { setStep("preview"); return; }
        newFilePath = dest;
        tabId = await openDb(dest);
        const newLabel = dest.replace(/\\/g, "/").split("/").pop() ?? tableName;
        addTab({ id: tabId, path: dest, label: newLabel, viewMode: "data", dirtyTxn: false });
      }
      if (!tabId) throw new Error("No active database tab to import into");

      const jid = crypto.randomUUID();
      let unsub1: (() => void) | null = null;
      let unsub2: (() => void) | null = null;
      const cleanup = () => {
        unsub1?.();
        unsub2?.();
        unlistenRefs.current = unlistenRefs.current.filter((f) => f !== unsub1 && f !== unsub2);
      };
      unsub1 = await onImportProgress(jid, (w) => setWritten(w));
      unlistenRefs.current.push(unsub1);
      unsub2 = await onImportDone(jid, async (w) => {
        setWritten(w);
        setStep("done");
        cleanup();
        const schema = await getDbSchema(tabId!);
        setSchema(tabId!, schema);
        if (newFilePath) {
          const label = newFilePath.replace(/\\/g, "/").split("/").pop() ?? tableName;
          addRecentFile({ path: newFilePath, label, openedAt: Date.now() });
        }
        addToast({ type: "success", message: `Imported ${w.toLocaleString()} rows into "${tableName}"` });
      });
      unlistenRefs.current.push(unsub2);

      await importCsv({
        tab_id: tabId,
        path: filePath,
        table_name: tableName,
        columns: columns.map((c) => [c.name, c.inferred_type] as [string, string]),
        delimiter,
        has_header: hasHeader,
      });
    } catch (e) {
      setStep("preview");
      addToast({ type: "error", message: `Import failed: ${extractError(e)}` });
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Import from CSV"
      width={620}
      footer={
        step === "done" ? (
          <Button variant="primary" size="sm" onClick={handleClose}>Close</Button>
        ) : step === "preview" ? (
          <>
            <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleImport} disabled={loading}>Import</Button>
          </>
        ) : step === "pick" ? (
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
        ) : null
      }
    >

      {step === "pick" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Choose a CSV or TSV file. Column types will be inferred automatically.
          </p>
          <Button variant="primary" size="sm" onClick={handlePickFile} disabled={loading}>
            {loading ? <><Spinner size={12} /> Reading…</> : <><FileInput size={12} /> Choose CSV file…</>}
          </Button>
        </div>
      )}


      {(step === "preview" || step === "importing" || step === "done") && (
        <div className="flex flex-col gap-4">

          {step === "preview" && (
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <FieldLabel>Table name</FieldLabel>
                <TextInput value={tableName} onChange={setTableName} monospace className="w-40" />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel>Delimiter</FieldLabel>
                <SelectInput
                  value={delimiter}
                  onChange={async (v) => { setDelimiter(v); await doInfer(filePath, v, hasHeader); }}
                  options={[
                    { value: ",", label: "Comma (,)" },
                    { value: ";", label: "Semicolon (;)" },
                    { value: "\\t", label: "Tab" },
                    { value: "|", label: "Pipe (|)" },
                  ]}
                />
              </div>
              <Toggle
                label="First row is header"
                checked={hasHeader}
                onChange={async (v) => { setHasHeader(v); await doInfer(filePath, delimiter, v); }}
              />
              {activeTab && (
                <div className="flex gap-2">
                  <Toggle label="New database" checked={target === "new"} onChange={(v) => v && setTarget("new")} />
                  <Toggle label={`Active tab (${activeTab.label})`} checked={target === "active"} onChange={(v) => v && setTarget("active")} />
                </div>
              )}
            </div>
          )}


          {step === "preview" && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Inferred columns ({totalRows.toLocaleString()} rows total)</FieldLabel>
              <div className="rounded overflow-auto max-h-32" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      {columns.map((c, i) => (
                        <th key={i} className="px-2 py-1 text-left font-normal" style={{ color: "var(--fg-subtle)", borderBottom: "1px solid var(--border)" }}>
                          <input
                            value={c.name}
                            onChange={(e) => setColumns((cols) => cols.map((col, j) => j === i ? { ...col, name: e.target.value } : col))}
                            className="bg-transparent outline-none w-full font-medium"
                            style={{ color: "var(--fg-0)" }}
                          />
                          <SelectInput
                            value={c.inferred_type}
                            onChange={(v) => setColumns((cols) => cols.map((col, j) => j === i ? { ...col, inferred_type: v } : col))}
                            options={["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC"].map((t) => ({ value: t, label: t }))}
                            className="w-full mt-0.5 text-[10px]"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)" }}>
                        {columns.map((_, ci) => (
                          <td key={ci} className="px-2 py-0.5 truncate max-w-24" style={{ color: "var(--fg-muted)" }}>
                            {row[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {(step === "importing" || step === "done") && (
            <div className="flex items-center gap-3 p-3 rounded" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              {step === "done" ? (
                <CheckCircle2 size={16} style={{ color: "var(--accent)" }} />
              ) : (
                <Spinner size={14} />
              )}
              <span className="text-xs" style={{ color: "var(--fg-0)" }}>
                {step === "done"
                  ? `Done — ${written.toLocaleString()} rows imported into "${tableName}"`
                  : `Importing… ${written.toLocaleString()} rows written`}
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

import { useState, useEffect, useMemo } from "react";
import { Database, AlertCircle, CheckCircle2, Undo2, Redo2, RefreshCw, Trash2, Eye, EyeOff, Layers, ChevronLeft, Loader2 } from "lucide-react";
import { useStore } from "../../../store";
import { modLabel } from "../../../lib/platform";
import { getMysqlSchemaFull, executeMysqlDdlAtomic, getMysqlSchema } from "../../../ipc/commands";
import { diffMysqlDraft } from "../../../lib/buildMysqlDdl";
import { extractError } from "../../../lib/extractError";
import type {
  MysqlBuilderDraft, MysqlBuilderSelection,
  MysqlDraftTable, MysqlDraftIndex, MysqlDraftView, MysqlDraftTrigger, MysqlDraftRoutine,
} from "../../../types/mysqlBuilder";
import MysqlBuilderObjectList from "./MysqlBuilderObjectList";
import MysqlTableEditor from "./MysqlTableEditor";
import MysqlIndexEditor from "./MysqlIndexEditor";
import MysqlViewEditor from "./MysqlViewEditor";
import MysqlTriggerEditor from "./MysqlTriggerEditor";
import MysqlRoutineEditor from "./MysqlRoutineEditor";
import MysqlDdlPreviewPane from "./MysqlDdlPreviewPane";
import ApplyConfirmModal from "../shared/ApplyConfirmModal";
import Button from "../../common/Button";

interface Props {
  tabId: string;
}

const MYSQL_CAVEAT = "MySQL cannot atomically roll back DDL; partial changes may persist if a later statement fails.";

export default function MysqlBuilderView({ tabId }: Props) {
  const {
    mysqlBuilderDrafts, mysqlBuilderSelection, mysqlBuilderHistory, mysqlBuilderFuture,
    initMysqlBuilderDraft, updateMysqlBuilderDraft, discardMysqlBuilderEdits, resyncMysqlBuilderDraft,
    setMysqlBuilderSelection, undoMysqlBuilderDraft, redoMysqlBuilderDraft,
    addToast, setSchema, tabs, setTabViewMode,
  } = useStore();

  const draft: MysqlBuilderDraft | undefined = mysqlBuilderDrafts[tabId];
  const selection: MysqlBuilderSelection = mysqlBuilderSelection[tabId] ?? null;
  const [loading, setLoading] = useState(!draft);
  const [applying, setApplying] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [failIndex, setFailIndex] = useState<number | undefined>(undefined);
  const [failMsg, setFailMsg] = useState<string | undefined>(undefined);
  const [previewVisible, setPreviewVisible] = useState(true);

  const canUndo = (mysqlBuilderHistory[tabId]?.length ?? 0) > 0;
  const canRedo = (mysqlBuilderFuture[tabId]?.length ?? 0) > 0;
  const activeTab = tabs.find((t) => t.id === tabId);
  const connLabel = activeTab?.label ?? tabId;

  useEffect(() => {
    if (draft) return;
    setLoading(true);
    getMysqlSchemaFull(tabId)
      .then((snap) => { initMysqlBuilderDraft(tabId, snap); setLoading(false); })
      .catch((e) => { addToast({ type: "error", message: `Failed to load schema: ${extractError(e)}` }); setLoading(false); });
  }, [tabId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoMysqlBuilderDraft(tabId); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redoMysqlBuilderDraft(tabId); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabId, undoMysqlBuilderDraft, redoMysqlBuilderDraft]);

  const diff = useMemo(() => {
    if (!draft) return null;
    return diffMysqlDraft(draft.snapshot, draft);
  }, [draft]);

  if (loading || !draft) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--fg-subtle)" }}>
        Loading schema…
      </div>
    );
  }

  const d = draft as MysqlBuilderDraft;

  function update(fn: (d: MysqlBuilderDraft) => MysqlBuilderDraft) {
    updateMysqlBuilderDraft(tabId, fn);
  }
  function sel(s: MysqlBuilderSelection) { setMysqlBuilderSelection(tabId, s); }


  function addTable() {
    const id = crypto.randomUUID();
    const t: MysqlDraftTable = {
      id, schema: d.currentDatabase, name: "", columns: [], primaryKey: null, constraints: [],
      engine: "InnoDB", charset: "utf8mb4", collate: "utf8mb4_0900_ai_ci",
      autoIncrementStart: null, comment: "", systemVersioned: false,
    };
    update((d) => ({ ...d, tables: [...d.tables, t] }));
    sel({ kind: "table", id });
  }

  function addIndex() {
    const id = crypto.randomUUID();
    const ix: MysqlDraftIndex = {
      id, name: "", table: d.tables[0]?.name ?? "", method: "BTREE", columns: [], unique: false,
    };
    update((d) => ({ ...d, indexes: [...d.indexes, ix] }));
    sel({ kind: "index", id });
  }

  function addView() {
    const id = crypto.randomUUID();
    const v: MysqlDraftView = { id, schema: d.currentDatabase, name: "", body: "SELECT 1" };
    update((d) => ({ ...d, views: [...d.views, v] }));
    sel({ kind: "view", id });
  }

  function addTrigger() {
    const id = crypto.randomUUID();
    const tr: MysqlDraftTrigger = {
      id, schema: d.currentDatabase, name: "", table: d.tables[0]?.name ?? "",
      timing: "AFTER", event: "INSERT", body: "BEGIN\n  -- body\nEND",
    };
    update((d) => ({ ...d, triggers: [...d.triggers, tr] }));
    sel({ kind: "trigger", id });
  }

  function addRoutine() {
    const id = crypto.randomUUID();
    const r: MysqlDraftRoutine = {
      id, schema: d.currentDatabase, name: "", kind: "PROCEDURE",
      parameters: "", returns: null, body: "BEGIN\n  -- body\nEND",
      deterministic: false, dataAccess: "CONTAINS SQL", sqlSecurity: "DEFINER",
    };
    update((d) => ({ ...d, routines: [...d.routines, r] }));
    sel({ kind: "routine", id });
  }


  function removeTable(id: string) { update((d) => ({ ...d, tables: d.tables.filter((x) => x.id !== id) })); if (selection?.kind === "table" && selection.id === id) sel(null); }
  function removeIndex(id: string) { update((d) => ({ ...d, indexes: d.indexes.filter((x) => x.id !== id) })); if (selection?.kind === "index" && selection.id === id) sel(null); }
  function removeView(id: string) { update((d) => ({ ...d, views: d.views.filter((x) => x.id !== id) })); if (selection?.kind === "view" && selection.id === id) sel(null); }
  function removeTrigger(id: string) { update((d) => ({ ...d, triggers: d.triggers.filter((x) => x.id !== id) })); if (selection?.kind === "trigger" && selection.id === id) sel(null); }
  function removeRoutine(id: string) { update((d) => ({ ...d, routines: d.routines.filter((x) => x.id !== id) })); if (selection?.kind === "routine" && selection.id === id) sel(null); }


  function renameTable(id: string, name: string) { update((d) => ({ ...d, tables: d.tables.map((t) => t.id === id ? { ...t, name } : t) })); }
  function renameIndex(id: string, name: string) { update((d) => ({ ...d, indexes: d.indexes.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameView(id: string, name: string) { update((d) => ({ ...d, views: d.views.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameTrigger(id: string, name: string) { update((d) => ({ ...d, triggers: d.triggers.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameRoutine(id: string, name: string) { update((d) => ({ ...d, routines: d.routines.map((x) => x.id === id ? { ...x, name } : x) })); }


  function patchTable(id: string, patch: Partial<MysqlDraftTable>) { update((d) => ({ ...d, tables: d.tables.map((t) => t.id === id ? { ...t, ...patch } : t) })); }
  function patchIndex(id: string, patch: Partial<MysqlDraftIndex>) { update((d) => ({ ...d, indexes: d.indexes.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchView(id: string, patch: Partial<MysqlDraftView>) { update((d) => ({ ...d, views: d.views.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchTrigger(id: string, patch: Partial<MysqlDraftTrigger>) { update((d) => ({ ...d, triggers: d.triggers.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchRoutine(id: string, patch: Partial<MysqlDraftRoutine>) { update((d) => ({ ...d, routines: d.routines.map((x) => x.id === id ? { ...x, ...patch } : x) })); }


  async function handleRefresh() {
    if (diff && diff.statements.length > 0) {
      if (!confirm("You have unapplied changes. Refresh and discard them?")) return;
    }
    try {
      const snap = await getMysqlSchemaFull(tabId);
      resyncMysqlBuilderDraft(tabId, snap);
      const legacySnap = await getMysqlSchema(tabId);
      setSchema(tabId, legacySnap);
      addToast({ type: "success", message: "Schema refreshed" });
    } catch (e) {
      addToast({ type: "error", message: `Refresh failed: ${extractError(e)}` });
    }
  }


  async function doApply() {
    if (!diff || diff.statements.length === 0) return;
    setApplying(true);
    setFailIndex(undefined);
    setFailMsg(undefined);
    try {
      await executeMysqlDdlAtomic(tabId, diff.statements);
      const newSnap = await getMysqlSchemaFull(tabId);
      resyncMysqlBuilderDraft(tabId, newSnap);
      const legacySnap = await getMysqlSchema(tabId);
      setSchema(tabId, legacySnap);
      addToast({ type: "success", message: `${diff.statements.length} change${diff.statements.length !== 1 ? "s" : ""} applied` });
    } catch (e: unknown) {
      const raw = e as { message?: string; index?: number };
      const msg = raw?.message ?? String(e);
      const idxMatch = msg.match(/statement (\d+)/i);
      if (idxMatch) setFailIndex(parseInt(idxMatch[1]));
      setFailMsg(msg);
      addToast({ type: "error", message: `Apply failed: ${extractError(e)}` });
    } finally {
      setApplying(false);
      setConfirmModal(false);
    }
  }

  function handleApplyClick() {
    if (!diff || diff.statements.length === 0) {
      addToast({ type: "info", message: "No changes to apply." });
      return;
    }
    setConfirmModal(true);
  }


  function renderEditor() {
    if (!selection) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--fg-subtle)" }}>
          <Database size={40} strokeWidth={1} />
          <p className="text-sm">Select an object from the left panel to edit it.</p>
          <button onClick={addTable}
            style={{ fontSize: 12, color: "var(--accent)", cursor: "default", padding: "4px 12px", border: "1px solid var(--accent)", borderRadius: 4 }}>
            + Add table
          </button>
        </div>
      );
    }

    if (selection.kind === "table") {
      const t = d.tables.find((x) => x.id === selection.id);
      if (!t) return null;
      return <MysqlTableEditor key={t.id} table={t} allTables={d.tables} flavor={d.flavor} onChange={(p) => patchTable(t.id, p)} />;
    }
    if (selection.kind === "index") {
      const ix = d.indexes.find((x) => x.id === selection.id);
      if (!ix) return null;
      return <MysqlIndexEditor key={ix.id} index={ix} allTables={d.tables} flavor={d.flavor} onChange={(p) => patchIndex(ix.id, p)} />;
    }
    if (selection.kind === "view") {
      const v = d.views.find((x) => x.id === selection.id);
      if (!v) return null;
      return <MysqlViewEditor key={v.id} view={v} onChange={(p) => patchView(v.id, p)} />;
    }
    if (selection.kind === "trigger") {
      const tr = d.triggers.find((x) => x.id === selection.id);
      if (!tr) return null;
      return <MysqlTriggerEditor key={tr.id} trigger={tr} allTables={d.tables} onChange={(p) => patchTrigger(tr.id, p)} />;
    }
    if (selection.kind === "routine") {
      const r = d.routines.find((x) => x.id === selection.id);
      if (!r) return null;
      return <MysqlRoutineEditor key={r.id} routine={r} onChange={(p) => patchRoutine(r.id, p)} />;
    }
    if (selection.kind === "sequence") {
      const s = d.sequences.find((x) => x.name === selection.name);
      if (!s) return null;
      return (
        <div className="px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={16} style={{ color: "var(--accent)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--fg-0)" }}>{s.name}</span>
            <span className="text-[10px] px-1.5 rounded" style={{ background: "var(--bg-2)", color: "var(--fg-subtle)", border: "1px solid var(--border)" }}>read-only</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs" style={{ color: "var(--fg-muted)" }}>
            {[
              ["Start", s.startWith],
              ["Increment", s.incrementBy],
              ["Min", s.minValue],
              ["Max", s.maxValue],
              ["Cache", s.cache],
              ["Cycle", s.cycle ? "YES" : "NO"],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono, monospace)", color: "var(--fg-0)" }}>{String(val)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
            MariaDB sequences are read-only in v1. Use SQL to modify.
          </p>
        </div>
      );
    }
    return null;
  }

  const hasErrors = (diff?.errors.length ?? 0) > 0;
  const hasChanges = (diff?.statements.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-0)" }}>
        <button
          onClick={() => setTabViewMode(tabId, "data")}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default shrink-0"
          style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
          title="Back to data view"
        >
          <ChevronLeft size={11} /> Data
        </button>
        <Database size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span className="text-xs truncate" style={{ color: "var(--fg-muted)" }}>{connLabel}</span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {hasErrors && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
              <AlertCircle size={12} /> {diff!.errors.length} error{diff!.errors.length !== 1 ? "s" : ""}
            </span>
          )}
          {!hasErrors && hasChanges && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
              <CheckCircle2 size={12} /> {diff!.statements.length} statement{diff!.statements.length !== 1 ? "s" : ""}
            </span>
          )}
          <button onClick={() => undoMysqlBuilderDraft(tabId)} disabled={!canUndo}
            title={`Undo (${modLabel("Z")})`}
            className="flex items-center justify-center w-7 h-7 rounded cursor-default disabled:opacity-25"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}>
            <Undo2 size={11} />
          </button>
          <button onClick={() => redoMysqlBuilderDraft(tabId)} disabled={!canRedo}
            title={`Redo (${modLabel("Shift+Z")})`}
            className="flex items-center justify-center w-7 h-7 rounded cursor-default disabled:opacity-25"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}>
            <Redo2 size={11} />
          </button>
          <button onClick={() => setPreviewVisible((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}>
            {previewVisible ? <EyeOff size={11} /> : <Eye size={11} />} SQL
          </button>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw size={11} /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => discardMysqlBuilderEdits(tabId)}>
            <Trash2 size={11} /> Discard
          </Button>
          <Button variant="primary" size="sm" onClick={handleApplyClick}
            disabled={hasErrors || applying}>
            {applying ? <><Loader2 size={11} className="animate-spin" /> Applying…</> : "Apply Changes"}
          </Button>
        </div>
      </div>


      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div style={{ width: 200, flexShrink: 0 }}>
          <MysqlBuilderObjectList
            draft={d}
            selection={selection}
            onSelect={sel}
            onAddTable={addTable}
            onAddIndex={addIndex}
            onAddView={addView}
            onAddTrigger={addTrigger}
            onAddRoutine={addRoutine}
            onRemoveTable={removeTable}
            onRemoveIndex={removeIndex}
            onRemoveView={removeView}
            onRemoveTrigger={removeTrigger}
            onRemoveRoutine={removeRoutine}
            onRenameTable={renameTable}
            onRenameIndex={renameIndex}
            onRenameView={renameView}
            onRenameTrigger={renameTrigger}
            onRenameRoutine={renameRoutine}
          />
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ borderLeft: "1px solid var(--border)" }}>
          {renderEditor()}
        </div>
        {previewVisible && diff && (
          <div style={{ width: 340, flexShrink: 0 }}>
            <MysqlDdlPreviewPane
              draft={d}
              snapshot={d.snapshot}
              failingStatementIndex={failIndex}
              failingError={failMsg}
            />
          </div>
        )}
      </div>

      {confirmModal && diff && (
        <ApplyConfirmModal
          destructive={diff.destructive}
          sql={diff.statements.join(";\n\n")}
          caveat={MYSQL_CAVEAT}
          onConfirm={doApply}
          onCancel={() => setConfirmModal(false)}
          applying={applying}
        />
      )}
    </div>
  );
}

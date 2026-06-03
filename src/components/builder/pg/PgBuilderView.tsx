import { useState, useEffect, useMemo } from "react";
import { Database, AlertCircle, CheckCircle2, Undo2, Redo2, RefreshCw, Trash2, Eye, EyeOff, ChevronLeft, Loader2 } from "lucide-react";
import { useStore } from "../../../store";
import { modLabel } from "../../../lib/platform";
import { getPgSchemaFull, executePgDdlAtomic, getPgSchema } from "../../../ipc/commands";
import { diffPgDraft } from "../../../lib/buildPgDdl";
import { extractError } from "../../../lib/extractError";
import type {
  PgBuilderDraft, PgBuilderSelection, PgDraftTable, PgDraftIndex,
  PgDraftView, PgDraftFunction, PgDraftTrigger, PgDraftEnum,
} from "../../../types/pgBuilder";
import PgBuilderObjectList from "./PgBuilderObjectList";
import PgTableEditor from "./PgTableEditor";
import PgIndexEditor from "./PgIndexEditor";
import PgViewEditor from "./PgViewEditor";
import PgFunctionEditor from "./PgFunctionEditor";
import PgTriggerEditor from "./PgTriggerEditor";
import PgEnumEditor from "./PgEnumEditor";
import PgDdlPreviewPane from "./PgDdlPreviewPane";
import PgApplyConfirmModal from "./PgApplyConfirmModal";
import Button from "../../common/Button";

interface Props {
  tabId: string;
}

export default function PgBuilderView({ tabId }: Props) {
  const {
    pgBuilderDrafts, pgBuilderSelection, pgBuilderHistory, pgBuilderFuture,
    initPgBuilderDraft, updatePgBuilderDraft, discardPgBuilderEdits, resyncPgBuilderDraft,
    setPgBuilderSelection, undoPgBuilderDraft, redoPgBuilderDraft,
    addToast, setSchema, tabs, setTabViewMode,
  } = useStore();

  const draft: PgBuilderDraft | undefined = pgBuilderDrafts[tabId];
  const selection: PgBuilderSelection = pgBuilderSelection[tabId] ?? null;
  const [loading, setLoading] = useState(!draft);
  const [applying, setApplying] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [failIndex, setFailIndex] = useState<number | undefined>(undefined);
  const [failMsg, setFailMsg] = useState<string | undefined>(undefined);
  const [previewVisible, setPreviewVisible] = useState(true);

  const canUndo = (pgBuilderHistory[tabId]?.length ?? 0) > 0;
  const canRedo = (pgBuilderFuture[tabId]?.length ?? 0) > 0;

  const activeTab = tabs.find((t) => t.id === tabId);
  const connLabel = activeTab?.label ?? tabId;


  useEffect(() => {
    if (draft) return;
    setLoading(true);
    getPgSchemaFull(tabId)
      .then((snap) => { initPgBuilderDraft(tabId, snap); setLoading(false); })
      .catch((e) => { addToast({ type: "error", message: `Failed to load schema: ${extractError(e)}` }); setLoading(false); });
  }, [tabId]);


  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoPgBuilderDraft(tabId); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redoPgBuilderDraft(tabId); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabId, undoPgBuilderDraft, redoPgBuilderDraft]);

  const diff = useMemo(() => {
    if (!draft) return null;
    return diffPgDraft(draft.snapshot, draft);
  }, [draft]);

  if (loading || !draft) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--fg-subtle)" }}>
        Loading schema…
      </div>
    );
  }

  const d = draft as PgBuilderDraft;

  function update(fn: (d: PgBuilderDraft) => PgBuilderDraft) {
    updatePgBuilderDraft(tabId, fn);
  }
  function sel(s: PgBuilderSelection) { setPgBuilderSelection(tabId, s); }


  function addTable() {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, tables: [...d.tables, { id, schema: d.defaultSchema, name: "", columns: [], primaryKey: null, uniques: [], checks: [], comment: null, unlogged: false, temporary: false }] }));
    sel({ kind: "table", id });
  }

  function addIndex() {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, indexes: [...d.indexes, { id, name: "", schema: d.defaultSchema, table: d.tables[0]?.name ?? "", method: "btree", columns: [], unique: false, whereClause: null, comment: null }] }));
    sel({ kind: "index", id });
  }

  function addView() {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, views: [...d.views, { id, schema: d.defaultSchema, name: "", sql: "SELECT 1", materialized: false, comment: null }] }));
    sel({ kind: "view", id });
  }

  function addFunction(): string {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, functions: [...d.functions, { id, schema: d.defaultSchema, name: "", language: "plpgsql" as const, returnsTrigger: false, returns: "void", securityDefiner: false, parameters: "", body: "", comment: null }] }));
    sel({ kind: "function", id });
    return id;
  }

  function addTrigger() {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, triggers: [...d.triggers, { id, schema: d.defaultSchema, name: "", table: d.tables[0]?.name ?? "", timing: "AFTER" as const, events: ["INSERT" as const], forEach: "ROW" as const, whenClause: null, functionId: "", comment: null }] }));
    sel({ kind: "trigger", id });
  }

  function addEnum() {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, enums: [...(d.enums ?? []), { id, schema: d.defaultSchema, name: "", values: [] }] }));
    sel({ kind: "enum", id });
  }


  function removeTable(id: string) { update((d) => ({ ...d, tables: d.tables.filter((x) => x.id !== id) })); if (selection?.kind === "table" && selection.id === id) sel(null); }
  function removeIndex(id: string) { update((d) => ({ ...d, indexes: d.indexes.filter((x) => x.id !== id) })); if (selection?.kind === "index" && selection.id === id) sel(null); }
  function removeView(id: string) { update((d) => ({ ...d, views: d.views.filter((x) => x.id !== id) })); if (selection?.kind === "view" && selection.id === id) sel(null); }
  function removeFunction(id: string) { update((d) => ({ ...d, functions: d.functions.filter((x) => x.id !== id) })); if (selection?.kind === "function" && selection.id === id) sel(null); }
  function removeTrigger(id: string) { update((d) => ({ ...d, triggers: d.triggers.filter((x) => x.id !== id) })); if (selection?.kind === "trigger" && selection.id === id) sel(null); }
  function removeEnum(id: string) { update((d) => ({ ...d, enums: (d.enums ?? []).filter((x) => x.id !== id) })); if (selection?.kind === "enum" && selection.id === id) sel(null); }


  function renameTable(id: string, name: string) { update((d) => ({ ...d, tables: d.tables.map((t) => t.id === id ? { ...t, name } : t) })); }
  function renameIndex(id: string, name: string) { update((d) => ({ ...d, indexes: d.indexes.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameView(id: string, name: string) { update((d) => ({ ...d, views: d.views.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameFunction(id: string, name: string) { update((d) => ({ ...d, functions: d.functions.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameTrigger(id: string, name: string) { update((d) => ({ ...d, triggers: d.triggers.map((x) => x.id === id ? { ...x, name } : x) })); }
  function renameEnum(id: string, name: string) { update((d) => ({ ...d, enums: (d.enums ?? []).map((x) => x.id === id ? { ...x, name } : x) })); }


  function patchTable(id: string, patch: Partial<PgDraftTable>) { update((d) => ({ ...d, tables: d.tables.map((t) => t.id === id ? { ...t, ...patch } : t) })); }
  function patchIndex(id: string, patch: Partial<PgDraftIndex>) { update((d) => ({ ...d, indexes: d.indexes.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchView(id: string, patch: Partial<PgDraftView>) { update((d) => ({ ...d, views: d.views.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchFunction(id: string, patch: Partial<PgDraftFunction>) { update((d) => ({ ...d, functions: d.functions.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchTrigger(id: string, patch: Partial<PgDraftTrigger>) { update((d) => ({ ...d, triggers: d.triggers.map((x) => x.id === id ? { ...x, ...patch } : x) })); }
  function patchEnum(id: string, patch: Partial<PgDraftEnum>) { update((d) => ({ ...d, enums: (d.enums ?? []).map((x) => x.id === id ? { ...x, ...patch } : x) })); }


  async function handleRefresh() {
    if (diff && diff.statements.length > 0) {
      if (!confirm("You have unapplied changes. Refresh and discard them?")) return;
    }
    try {
      const snap = await getPgSchemaFull(tabId);
      resyncPgBuilderDraft(tabId, snap);
      const legacySnap = await getPgSchema(tabId);
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
      await executePgDdlAtomic(tabId, diff.statements);
      const newSnap = await getPgSchemaFull(tabId);
      resyncPgBuilderDraft(tabId, newSnap);
      const legacySnap = await getPgSchema(tabId);
      setSchema(tabId, legacySnap);
      addToast({ type: "success", message: `${diff.statements.length} change${diff.statements.length !== 1 ? "s" : ""} applied` });
    } catch (e: unknown) {
      const raw = e as { message?: string; index?: number };

      const msg = raw?.message ?? String(e);
      const idxMatch = msg.match(/statement (\d+)/);
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
    if (diff.destructive.length > 0) {
      setConfirmModal(true);
    } else {
      doApply();
    }
  }


  function renderEditor() {
    if (!selection) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--fg-subtle)" }}>
          <Database size={40} strokeWidth={1} />
          <p className="text-sm">Select an object from the left panel to edit it.</p>
          <button
            onClick={addTable}
            style={{ fontSize: 12, color: "var(--accent)", cursor: "default", padding: "4px 12px", border: "1px solid var(--accent)", borderRadius: 4 }}
          >+ Add table</button>
        </div>
      );
    }
    if (selection.kind === "table") {
      const t = d.tables.find((x) => x.id === selection.id);
      if (!t) return null;
      return <PgTableEditor key={t.id} table={t} allTables={d.tables} availableSchemas={d.availableSchemas} onChange={(patch) => patchTable(t.id, patch)} />;
    }
    if (selection.kind === "index") {
      const ix = d.indexes.find((x) => x.id === selection.id);
      if (!ix) return null;
      return <PgIndexEditor key={ix.id} index={ix} allTables={d.tables} availableSchemas={d.availableSchemas} onChange={(patch) => patchIndex(ix.id, patch)} />;
    }
    if (selection.kind === "view") {
      const v = d.views.find((x) => x.id === selection.id);
      if (!v) return null;
      return <PgViewEditor key={v.id} view={v} availableSchemas={d.availableSchemas} onChange={(patch) => patchView(v.id, patch)} />;
    }
    if (selection.kind === "function") {
      const f = d.functions.find((x) => x.id === selection.id);
      if (!f) return null;
      return <PgFunctionEditor key={f.id} fn={f} availableSchemas={d.availableSchemas} onChange={(patch) => patchFunction(f.id, patch)} />;
    }
    if (selection.kind === "trigger") {
      const tr = d.triggers.find((x) => x.id === selection.id);
      if (!tr) return null;
      return (
        <PgTriggerEditor
          key={tr.id}
          trigger={tr}
          allTables={d.tables}
          allFunctions={d.functions}
          availableSchemas={d.availableSchemas}
          onChange={(patch) => patchTrigger(tr.id, patch)}
          onAddFunction={addFunction}
        />
      );
    }
    if (selection.kind === "enum") {
      const e = (d.enums ?? []).find((x) => x.id === selection.id);
      if (!e) return null;
      return <PgEnumEditor key={e.id} enum_={e} availableSchemas={d.availableSchemas} onChange={(patch) => patchEnum(e.id, patch)} />;
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
          <button onClick={() => undoPgBuilderDraft(tabId)} disabled={!canUndo}
            title={`Undo (${modLabel("Z")})`}
            className="flex items-center justify-center w-7 h-7 rounded cursor-default disabled:opacity-25"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}>
            <Undo2 size={11} />
          </button>
          <button onClick={() => redoPgBuilderDraft(tabId)} disabled={!canRedo}
            title={`Redo (${modLabel("Shift+Z")})`}
            className="flex items-center justify-center w-7 h-7 rounded cursor-default disabled:opacity-25"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}>
            <Redo2 size={11} />
          </button>
          <button
            onClick={() => setPreviewVisible((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
          >
            {previewVisible ? <EyeOff size={11} /> : <Eye size={11} />} SQL
          </button>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw size={11} /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => discardPgBuilderEdits(tabId)}>
            <Trash2 size={11} /> Discard
          </Button>
          <Button
            variant="primary" size="sm"
            onClick={handleApplyClick}
            disabled={hasErrors || applying}
          >
            {applying ? <><Loader2 size={11} className="animate-spin" /> Applying…</> : "Apply Changes"}
          </Button>
        </div>
      </div>


      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div style={{ width: 200, flexShrink: 0 }}>
          <PgBuilderObjectList
            draft={d}
            selection={selection}
            onSelect={sel}
            onAddTable={addTable}
            onAddIndex={addIndex}
            onAddView={addView}
            onAddFunction={addFunction}
            onAddTrigger={addTrigger}
            onAddEnum={addEnum}
            onRemoveTable={removeTable}
            onRemoveIndex={removeIndex}
            onRemoveView={removeView}
            onRemoveFunction={removeFunction}
            onRemoveTrigger={removeTrigger}
            onRemoveEnum={removeEnum}
            onRenameTable={renameTable}
            onRenameIndex={renameIndex}
            onRenameView={renameView}
            onRenameFunction={renameFunction}
            onRenameTrigger={renameTrigger}
            onRenameEnum={renameEnum}
          />
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ borderLeft: "1px solid var(--border)" }}>
          {renderEditor()}
        </div>
        {previewVisible && diff && (
          <div style={{ width: 340, flexShrink: 0 }}>
            <PgDdlPreviewPane
              draft={d}
              snapshot={d.snapshot}
              failingStatementIndex={failIndex}
              failingError={failMsg}
            />
          </div>
        )}
      </div>

      {confirmModal && diff && (
        <PgApplyConfirmModal
          destructive={diff.destructive}
          sql={diff.sql}
          onConfirm={doApply}
          onCancel={() => setConfirmModal(false)}
          applying={applying}
        />
      )}
    </div>
  );
}

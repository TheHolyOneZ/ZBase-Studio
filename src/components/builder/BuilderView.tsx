import { useState, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { remove } from "@tauri-apps/plugin-fs";
import { HardDrive, Eye, EyeOff, AlertCircle, CheckCircle2, Trash2, Undo2, Redo2 } from "lucide-react";
import { useStore } from "../../store";
import { modLabel } from "../../lib/platform";
import { openDb, closeDb, executeDdl, getDbSchema } from "../../ipc/commands";
import { buildDdl } from "../../lib/buildDdl";
import { extractError } from "../../lib/extractError";
import type { BuilderDraft, BuilderSelection, DraftIndex, DraftTable, DraftTrigger, DraftView } from "../../types/builder";
import BuilderObjectList from "./BuilderObjectList";
import TableEditor from "./TableEditor";
import IndexEditor from "./IndexEditor";
import ViewEditor from "./ViewEditor";
import TriggerEditor from "./TriggerEditor";
import SqlPreviewPane from "./SqlPreviewPane";
import Button from "../common/Button";
import { TextInput } from "../common/FormControls";

interface Props {
  tabId: string;
}

export default function BuilderView({ tabId }: Props) {
  const {
    builderDrafts, builderSelection, builderHistory, builderFuture,
    updateBuilderDraft, discardBuilderDraft,
    promoteBuilderTab, setBuilderSelection, addToast, setSchema,
    addRecentFile, undoBuilderDraft, redoBuilderDraft,
  } = useStore();

  const draft = builderDrafts[tabId];
  const selection: BuilderSelection = builderSelection[tabId] ?? null;
  const [previewVisible, setPreviewVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  const canUndo = (builderHistory[tabId]?.length ?? 0) > 0;
  const canRedo = (builderFuture[tabId]?.length ?? 0) > 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoBuilderDraft(tabId); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redoBuilderDraft(tabId); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabId, undoBuilderDraft, redoBuilderDraft]);

  if (!draft) return null;

  function update(fn: (d: BuilderDraft) => BuilderDraft) {
    updateBuilderDraft(tabId, fn);
  }

  function sel(s: BuilderSelection) {
    setBuilderSelection(tabId, s);
  }


  function addTable() {
    const id = crypto.randomUUID();
    update((d) => ({
      ...d,
      tables: [...d.tables, { id, name: "", columns: [], compositePk: null, tableChecks: [], withoutRowid: false, strict: false }],
    }));
    sel({ kind: "table", id });
  }

  function addIndex() {
    const id = crypto.randomUUID();
    const firstTable = draft.tables[0]?.name ?? "";
    update((d) => ({
      ...d,
      indexes: [...d.indexes, { id, name: "", table: firstTable, columns: [], unique: false, whereClause: null }],
    }));
    sel({ kind: "index", id });
  }

  function addView() {
    const id = crypto.randomUUID();
    update((d) => ({ ...d, views: [...d.views, { id, name: "", sql: "SELECT 1" }] }));
    sel({ kind: "view", id });
  }

  function addTrigger() {
    const id = crypto.randomUUID();
    const firstTable = draft.tables[0]?.name ?? "";
    update((d) => ({
      ...d,
      triggers: [...d.triggers, { id, name: "", table: firstTable, timing: "AFTER", event: "INSERT", whenClause: null, body: "" }],
    }));
    sel({ kind: "trigger", id });
  }

  function removeTable(id: string) {
    update((d) => ({ ...d, tables: d.tables.filter((t) => t.id !== id) }));
    if (selection?.kind === "table" && selection.id === id) sel(null);
  }

  function removeIndex(id: string) {
    update((d) => ({ ...d, indexes: d.indexes.filter((ix) => ix.id !== id) }));
    if (selection?.kind === "index" && selection.id === id) sel(null);
  }

  function removeView(id: string) {
    update((d) => ({ ...d, views: d.views.filter((v) => v.id !== id) }));
    if (selection?.kind === "view" && selection.id === id) sel(null);
  }

  function removeTrigger(id: string) {
    update((d) => ({ ...d, triggers: d.triggers.filter((tr) => tr.id !== id) }));
    if (selection?.kind === "trigger" && selection.id === id) sel(null);
  }


  function renameTable(id: string, name: string) {
    update((d) => ({ ...d, tables: d.tables.map((t) => t.id === id ? { ...t, name } : t) }));
  }

  function renameIndex(id: string, name: string) {
    update((d) => ({ ...d, indexes: d.indexes.map((ix) => ix.id === id ? { ...ix, name } : ix) }));
  }

  function renameView(id: string, name: string) {
    update((d) => ({ ...d, views: d.views.map((v) => v.id === id ? { ...v, name } : v) }));
  }

  function renameTrigger(id: string, name: string) {
    update((d) => ({ ...d, triggers: d.triggers.map((tr) => tr.id === id ? { ...tr, name } : tr) }));
  }


  function duplicateTable(id: string) {
    const t = draft.tables.find((x) => x.id === id);
    if (!t) return;
    const newId = crypto.randomUUID();
    const copy: DraftTable = {
      ...t,
      id: newId,
      name: t.name ? `${t.name}_copy` : "",
      columns: t.columns.map((c) => ({ ...c, id: crypto.randomUUID() })),
    };
    update((d) => ({ ...d, tables: [...d.tables, copy] }));
    sel({ kind: "table", id: newId });
  }

  function duplicateIndex(id: string) {
    const ix = draft.indexes.find((x) => x.id === id);
    if (!ix) return;
    const newId = crypto.randomUUID();
    const copy: DraftIndex = { ...ix, id: newId, name: ix.name ? `${ix.name}_copy` : "" };
    update((d) => ({ ...d, indexes: [...d.indexes, copy] }));
    sel({ kind: "index", id: newId });
  }

  function duplicateView(id: string) {
    const v = draft.views.find((x) => x.id === id);
    if (!v) return;
    const newId = crypto.randomUUID();
    const copy: DraftView = { ...v, id: newId, name: v.name ? `${v.name}_copy` : "" };
    update((d) => ({ ...d, views: [...d.views, copy] }));
    sel({ kind: "view", id: newId });
  }

  function duplicateTrigger(id: string) {
    const tr = draft.triggers.find((x) => x.id === id);
    if (!tr) return;
    const newId = crypto.randomUUID();
    const copy: DraftTrigger = { ...tr, id: newId, name: tr.name ? `${tr.name}_copy` : "" };
    update((d) => ({ ...d, triggers: [...d.triggers, copy] }));
    sel({ kind: "trigger", id: newId });
  }


  function patchTable(id: string, patch: Partial<DraftTable>) {
    update((d) => ({ ...d, tables: d.tables.map((t) => t.id === id ? { ...t, ...patch } : t) }));
  }

  function patchIndex(id: string, patch: Partial<DraftIndex>) {
    update((d) => ({ ...d, indexes: d.indexes.map((ix) => ix.id === id ? { ...ix, ...patch } : ix) }));
  }

  function patchView(id: string, patch: Partial<DraftView>) {
    update((d) => ({ ...d, views: d.views.map((v) => v.id === id ? { ...v, ...patch } : v) }));
  }

  function patchTrigger(id: string, patch: Partial<DraftTrigger>) {
    update((d) => ({ ...d, triggers: d.triggers.map((tr) => tr.id === id ? { ...tr, ...patch } : tr) }));
  }


  const { sql: previewSql, errors } = buildDdl(draft);
  const hasErrors = errors.length > 0;

  async function handleSave() {
    if (hasErrors || saving) return;

    const sql = previewSql;
    if (!sql.trim()) {
      addToast({ type: "warning", message: "Add at least one table before saving" });
      return;
    }

    const filePath = await save({
      defaultPath: `${draft.label.replace(/[^a-zA-Z0-9_\-. ]/g, "_")}.db`,
      filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    if (!filePath) return;

    setSaving(true);
    let realTabId: string | null = null;
    try {
      realTabId = await openDb(filePath);
      await executeDdl(realTabId, sql);
      const schema = await getDbSchema(realTabId);
      const label = filePath.replace(/\\/g, "/").split("/").pop() ?? draft.label;
      promoteBuilderTab(tabId, realTabId, filePath, label);
      setSchema(realTabId, schema);
      addRecentFile({ path: filePath, label, openedAt: Date.now() });
      addToast({ type: "success", message: `Database saved: ${label}` });
    } catch (e) {

      if (realTabId !== null) {
        try { await closeDb(realTabId); } catch {}
        try { await remove(filePath); } catch {}
      }
      addToast({ type: "error", message: `Save failed: ${extractError(e)}` });
    } finally {
      setSaving(false);
    }
  }


  function renderEditor() {
    if (!selection) {
      const isEmpty = draft.tables.length === 0 && draft.indexes.length === 0 &&
        draft.views.length === 0 && draft.triggers.length === 0;
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--fg-subtle)" }}>
          <HardDrive size={40} strokeWidth={1} />
          {isEmpty ? (
            <>
              <p className="text-sm">Start building your database schema.</p>
              <Button variant="primary" size="sm" onClick={addTable}>
                + Add your first table
              </Button>
            </>
          ) : (
            <p className="text-sm">Select an object from the left panel to edit it.</p>
          )}
        </div>
      );
    }
    if (selection.kind === "table") {
      const t = draft.tables.find((x) => x.id === selection.id);
      if (!t) return null;
      return <TableEditor key={t.id} table={t} allTables={draft.tables} onChange={(patch) => patchTable(t.id, patch)} />;
    }
    if (selection.kind === "index") {
      const ix = draft.indexes.find((x) => x.id === selection.id);
      if (!ix) return null;
      return <IndexEditor key={ix.id} index={ix} allTables={draft.tables} onChange={(patch) => patchIndex(ix.id, patch)} />;
    }
    if (selection.kind === "view") {
      const v = draft.views.find((x) => x.id === selection.id);
      if (!v) return null;
      return <ViewEditor key={v.id} view={v} onChange={(patch) => patchView(v.id, patch)} />;
    }
    if (selection.kind === "trigger") {
      const tr = draft.triggers.find((x) => x.id === selection.id);
      if (!tr) return null;
      return <TriggerEditor key={tr.id} trigger={tr} allTables={draft.tables} onChange={(patch) => patchTrigger(tr.id, patch)} />;
    }
    return null;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div
        className="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-0)" }}
      >
        <HardDrive size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <TextInput
            value={draft.label}
            onChange={(v) => update((d) => ({ ...d, label: v }))}
            placeholder="Database name"
            className="max-w-56 font-medium"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {hasErrors && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
              <AlertCircle size={12} /> {errors.length} error{errors.length !== 1 ? "s" : ""}
            </span>
          )}
          {!hasErrors && previewSql && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
              <CheckCircle2 size={12} /> Ready to save
            </span>
          )}

          <button
            onClick={() => undoBuilderDraft(tabId)}
            disabled={!canUndo}
            title={`Undo (${modLabel("Z")})`}
            className="flex items-center justify-center w-7 h-7 rounded cursor-default transition-opacity disabled:opacity-25"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
          >
            <Undo2 size={11} />
          </button>
          <button
            onClick={() => redoBuilderDraft(tabId)}
            disabled={!canRedo}
            title={`Redo (${modLabel("Shift+Z")})`}
            className="flex items-center justify-center w-7 h-7 rounded cursor-default transition-opacity disabled:opacity-25"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
          >
            <Redo2 size={11} />
          </button>
          <button
            onClick={() => setPreviewVisible((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default transition-all"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
          >
            {previewVisible ? <EyeOff size={11} /> : <Eye size={11} />}
            SQL
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => discardBuilderDraft(tabId)}
          >
            <Trash2 size={11} /> Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={hasErrors || saving}
          >
            <HardDrive size={11} /> {saving ? "Saving…" : "Save Database…"}
          </Button>
        </div>
      </div>


      <div className="flex flex-1 min-h-0 overflow-hidden">

        <div style={{ width: 200, flexShrink: 0 }}>
          <BuilderObjectList
            draft={draft}
            selection={selection}
            onSelect={sel}
            onAddTable={addTable}
            onAddIndex={addIndex}
            onAddView={addView}
            onAddTrigger={addTrigger}
            onRemoveTable={removeTable}
            onRemoveIndex={removeIndex}
            onRemoveView={removeView}
            onRemoveTrigger={removeTrigger}
            onRenameTable={renameTable}
            onRenameIndex={renameIndex}
            onRenameView={renameView}
            onRenameTrigger={renameTrigger}
            onDuplicateTable={duplicateTable}
            onDuplicateIndex={duplicateIndex}
            onDuplicateView={duplicateView}
            onDuplicateTrigger={duplicateTrigger}
          />
        </div>


        <div className="flex-1 min-w-0 overflow-y-auto" style={{ borderLeft: "1px solid var(--border)" }}>
          {renderEditor()}
        </div>


        {previewVisible && (
          <div style={{ width: 340, flexShrink: 0 }}>
            <SqlPreviewPane draft={draft} />
          </div>
        )}
      </div>
    </div>
  );
}
